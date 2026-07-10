package com.toucan_motion.toucan.engine;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * {@link AnimationEngine} that shells out to the standalone {@code toucan-motion} CLI:
 *
 * <pre>
 * node dist/cli.js generate --topic "&lt;prompt&gt;" --out &lt;tmp&gt; [--mock | --provider &lt;p&gt; [--model &lt;m&gt;]]
 * node dist/cli.js edit --html &lt;cur&gt; --message "&lt;req&gt;" [--thread &lt;t&gt;] --out &lt;tmp&gt; [--mock | --provider …]
 * </pre>
 *
 * <p>Reusing the CLI keeps a single source of truth for the prompts, the self-containment +
 * headless-Chromium gate, the one-shot auto-repair, and the usage/cost telemetry. The CLI writes the
 * HTML to a temp file (read back here, then deleted) and prints a {@code usage[generate|edit] {json}}
 * line to stdout on real runs, which we parse for cost attribution.
 *
 * <p>The subprocess runs with its working directory set to the CLI project (default {@code
 * toucan-motion}) so its {@code dotenv} picks up {@code toucan-motion/.env} (the API key). It inherits
 * the JVM's environment, so an {@code ANTHROPIC_API_KEY} already exported to the app is honored too.
 */
@Component
public class CliAnimationEngine implements AnimationEngine {

    private static final Logger log = LoggerFactory.getLogger(CliAnimationEngine.class);

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${app.engine.cli.node:node}")
    private String node;

    @Value("${app.engine.cli.script:dist/cli.js}")
    private String script;

    @Value("${app.engine.cli.working-dir:toucan-motion}")
    private String workingDir;

    @Value("${app.engine.cli.provider:anthropic}")
    private String provider;

    /** Empty means "let the CLI pick its provider default" (currently {@code claude-sonnet-5}). */
    @Value("${app.engine.cli.model:}")
    private String model;

    /** Keyless smoke path: use the engine's reference fixture instead of the API (no spend). */
    @Value("${app.engine.mock:false}")
    private boolean mock;

    @Value("${app.engine.cli.timeout-seconds:300}")
    private long timeoutSeconds;

    @Override
    public EngineResult generate(UUID animationId, String prompt) {
        Path out = null;
        try {
            out = Files.createTempFile("toucan-" + animationId + "-", ".html");
            List<String> cmd = new ArrayList<>(List.of(node, script, "generate", "--topic", prompt));
            cmd.addAll(List.of("--out", out.toAbsolutePath().toString()));
            cmd.addAll(modeArgs());
            log.info(
                    "HTML engine generate for {} ({})",
                    animationId,
                    mock ? "mock fixture" : provider + "/" + (model.isBlank() ? "default" : model));
            return invoke(cmd, out);
        } catch (IOException e) {
            throw new EngineException("engine invocation failed: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new EngineException("engine invocation interrupted", e);
        } finally {
            deleteQuietly(out);
        }
    }

    @Override
    public EngineResult edit(UUID conversationId, String currentHtml, String thread, String message) {
        Path current = null;
        Path threadFile = null;
        Path out = null;
        try {
            current = Files.createTempFile("toucan-" + conversationId + "-cur-", ".html");
            Files.writeString(current, currentHtml, StandardCharsets.UTF_8);
            out = Files.createTempFile("toucan-" + conversationId + "-", ".html");

            List<String> cmd =
                    new ArrayList<>(
                            List.of(
                                    node,
                                    script,
                                    "edit",
                                    "--html",
                                    current.toAbsolutePath().toString(),
                                    "--message",
                                    message,
                                    "--out",
                                    out.toAbsolutePath().toString()));
            if (thread != null && !thread.isBlank()) {
                threadFile = Files.createTempFile("toucan-" + conversationId + "-thread-", ".txt");
                Files.writeString(threadFile, thread, StandardCharsets.UTF_8);
                cmd.addAll(List.of("--thread", threadFile.toAbsolutePath().toString()));
            }
            cmd.addAll(modeArgs());
            log.info(
                    "HTML engine edit for {} ({})",
                    conversationId,
                    mock ? "mock fixture" : provider + "/" + (model.isBlank() ? "default" : model));
            return invoke(cmd, out);
        } catch (IOException e) {
            throw new EngineException("engine invocation failed: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new EngineException("engine invocation interrupted", e);
        } finally {
            deleteQuietly(current);
            deleteQuietly(threadFile);
            deleteQuietly(out);
        }
    }

    /** The mock/provider tail shared by generate and edit. */
    private List<String> modeArgs() {
        if (mock) {
            return List.of("--mock");
        }
        List<String> args = new ArrayList<>(List.of("--provider", provider));
        if (!model.isBlank()) {
            args.addAll(List.of("--model", model));
        }
        return args;
    }

    /** Run the command, check the exit code, read the HTML from {@code out}, and parse usage. */
    private EngineResult invoke(List<String> cmd, Path out) throws IOException, InterruptedException {
        String output = run(cmd);
        String html = Files.readString(out, StandardCharsets.UTF_8);
        if (html.isBlank()) {
            throw new EngineException("engine produced an empty HTML file");
        }
        String usageJson = extractUsageJson(output);
        return new EngineResult(html, parseUsage(usageJson), usageJson);
    }

    /** Run the CLI, draining stdout+stderr on a background thread with a hard timeout. */
    private String run(List<String> cmd) throws IOException, InterruptedException {
        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.directory(new File(workingDir).getAbsoluteFile());
        pb.redirectErrorStream(true);
        Process proc = pb.start();

        StringBuilder out = new StringBuilder();
        Thread reader =
                new Thread(
                        () -> {
                            try (BufferedReader br =
                                    new BufferedReader(
                                            new InputStreamReader(
                                                    proc.getInputStream(), StandardCharsets.UTF_8))) {
                                String line;
                                while ((line = br.readLine()) != null) {
                                    out.append(line).append('\n');
                                }
                            } catch (IOException ignored) {
                                // stream closed on process exit / destroy
                            }
                        });
        reader.setDaemon(true);
        reader.start();

        boolean finished = proc.waitFor(timeoutSeconds, TimeUnit.SECONDS);
        if (!finished) {
            proc.destroyForcibly();
            reader.join(2000);
            throw new EngineException(
                    "engine timed out after " + timeoutSeconds + "s:\n" + tail(out.toString(), 40));
        }
        reader.join(5000);
        int code = proc.exitValue();
        if (code != 0) {
            throw new EngineException("engine exited " + code + ":\n" + tail(out.toString(), 40));
        }
        return out.toString();
    }

    /** The raw JSON of the last {@code usage[<stage>] {json}} line (generate or edit), or null. */
    private static String extractUsageJson(String output) {
        String found = null;
        for (String line : output.split("\n")) {
            String trimmed = line.trim();
            if (trimmed.startsWith("usage[")) {
                int i = trimmed.indexOf("] ");
                if (i >= 0) {
                    found = trimmed.substring(i + 2).trim();
                }
            }
        }
        return found;
    }

    private EngineUsage parseUsage(String usageJson) {
        if (usageJson == null) {
            return null;
        }
        try {
            JsonNode n = objectMapper.readTree(usageJson);
            return new EngineUsage(
                    text(n, "provider"),
                    text(n, "model"),
                    n.hasNonNull("inputTokens") ? n.get("inputTokens").asLong() : null,
                    n.hasNonNull("outputTokens") ? n.get("outputTokens").asLong() : null,
                    n.hasNonNull("costUsd") ? n.get("costUsd").asDouble() : null);
        } catch (IOException e) {
            log.warn("Could not parse engine usage line '{}': {}", usageJson, e.getMessage());
            return null;
        }
    }

    private static String text(JsonNode n, String field) {
        return n.hasNonNull(field) ? n.get(field).asText() : null;
    }

    private static void deleteQuietly(Path p) {
        if (p != null) {
            try {
                Files.deleteIfExists(p);
            } catch (IOException ignored) {
                // best-effort temp cleanup
            }
        }
    }

    private static String tail(String s, int lines) {
        String[] all = s.split("\n");
        int from = Math.max(0, all.length - lines);
        return String.join("\n", java.util.Arrays.copyOfRange(all, from, all.length));
    }
}
