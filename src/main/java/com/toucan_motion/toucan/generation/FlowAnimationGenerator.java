package com.toucan_motion.toucan.generation;

import com.toucan_motion.toucan.entity.AnimationType;
import com.toucan_motion.toucan.generation.render.HtmlBundler;
import com.toucan_motion.toucan.generation.spec.FlowSpec;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Type 1 — Sequential Flow (the hero type). The model only decides the stages (labels, order,
 * sublabels, icons) and the traveler; all motion lives in {@code renderer/flow.js}.
 */
@Component
public class FlowAnimationGenerator extends SpecAnimationGenerator<FlowSpec> {

    public FlowAnimationGenerator(LlmClient llm, HtmlBundler bundler) {
        super(llm, bundler);
    }

    @Override
    public AnimationType type() {
        return AnimationType.FLOW;
    }

    @Override
    protected String wireType() {
        return "flow";
    }

    @Override
    protected Class<FlowSpec> specClass() {
        return FlowSpec.class;
    }

    @Override
    protected String rendererResource() {
        return "renderer/flow.js";
    }

    @Override
    protected String title(FlowSpec spec) {
        return spec.getTitle();
    }

    @Override
    protected String systemPrompt() {
        return """
                You design "Sequential Flow" explainer animations for Toucan. You do NOT write any \
                code, styling or animation — a deterministic renderer handles all visuals. Your only \
                job is to turn the user's concept into a JSON spec describing the ordered stages \
                something passes through.

                Return ONE JSON object and NOTHING else (no prose, no markdown fences), matching:

                {
                  "type": "flow",
                  "title": "<short headline, e.g. 'How a request reaches the database'>",
                  "direction": "horizontal",
                  "nodes": [
                    { "id": "client",  "label": "Client",        "sublabel": "browser",     "icon": "globe" },
                    { "id": "cdn",     "label": "CDN",           "sublabel": "edge cache",  "icon": "cloud" },
                    { "id": "lb",      "label": "Load Balancer", "sublabel": null,          "icon": "queue" },
                    { "id": "backend", "label": "Backend",       "sublabel": "API",         "icon": "server" },
                    { "id": "db",      "label": "Database",      "sublabel": "Postgres",    "icon": "database" }
                  ],
                  "traveler": { "label": "request", "shape": "dot" },
                  "beatDurationMs": 900
                }

                Sign-up example:
                { "id": "landing",    "label": "Landing Page",       "sublabel": null,       "icon": "page" },
                { "id": "signup",     "label": "Sign Up",            "sublabel": "form",     "icon": "form" },
                { "id": "email",      "label": "Email Verification", "sublabel": null,       "icon": "mail" },
                { "id": "onboarding", "label": "Onboarding",         "sublabel": null,       "icon": "check" },
                { "id": "activation", "label": "Activation",         "sublabel": "account",  "icon": "user" }

                RULES:
                - Linear only: a single ordered chain. No branching, parallel paths or loops back.
                - 3 to 6 nodes. Each needs a short "label"; "sublabel" is optional.
                - "id" is a short unique slug per node.
                - "traveler.label" names the thing moving through the flow (request, packet, user, \
                payment, …). shape is "dot".
                - Pick "direction" that suits the content; default "horizontal".
                - Keep labels tight (1-3 words). Make the stages accurate to the concept.
                - ICONS: each node SHOULD include an "icon" field with the single best-fit value \
                from this closed set. If nothing fits, omit the field (do not guess or invent values):
                  page form mail lock key check user users server database cloud shield
                  gear card money api queue search bell code terminal mobile globe cart
                  send clock doc chart
                """;
    }

    @Override
    protected String userPrompt(String description) {
        return "Concept to explain as a sequential flow:\n\n"
                + description
                + "\n\nReturn only the JSON spec.";
    }

    @Override
    protected FlowSpec stubSpec(String description) {
        FlowSpec spec = new FlowSpec();
        spec.setType("flow");
        spec.setTitle(description == null || description.isBlank() ? "How a request flows" : description.strip());
        spec.setDirection("horizontal");
        spec.setNodes(new ArrayList<>(List.of(
                node("client",  "Client",       "browser",    "globe"),
                node("cdn",     "CDN",          "edge cache", "cloud"),
                node("lb",      "Load Balancer", null,        "queue"),
                node("backend", "Backend",      "API",        "server"),
                node("db",      "Database",     "Postgres",   "database"))));
        FlowSpec.Traveler t = new FlowSpec.Traveler();
        t.setLabel("request");
        t.setShape("dot");
        spec.setTraveler(t);
        spec.setBeatDurationMs(900);
        return spec;
    }

    private static FlowSpec.Node node(String id, String label, String sublabel, String icon) {
        FlowSpec.Node n = new FlowSpec.Node();
        n.setId(id);
        n.setLabel(label);
        n.setSublabel(sublabel);
        n.setIcon(icon);
        return n;
    }
}
