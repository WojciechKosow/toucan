package com.toucan_motion.toucan.generation;

import com.toucan_motion.toucan.entity.AnimationType;
import com.toucan_motion.toucan.generation.render.HtmlBundler;
import com.toucan_motion.toucan.generation.spec.DataStructureSpec;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Type 3 — Data Structure. The model decides the structure, its initial contents and the sequence of
 * operations; all transition animation lives in {@code renderer/datastructure.js}.
 */
@Component
public class DataStructureAnimationGenerator extends SpecAnimationGenerator<DataStructureSpec> {

    public DataStructureAnimationGenerator(LlmClient llm, HtmlBundler bundler) {
        super(llm, bundler);
    }

    @Override
    public AnimationType type() {
        return AnimationType.DATA_STRUCTURE;
    }

    @Override
    protected String wireType() {
        return "datastructure";
    }

    @Override
    protected Class<DataStructureSpec> specClass() {
        return DataStructureSpec.class;
    }

    @Override
    protected String rendererResource() {
        return "renderer/datastructure.js";
    }

    @Override
    protected String title(DataStructureSpec spec) {
        return "Toucan — " + spec.getStructure();
    }

    @Override
    protected String systemPrompt() {
        return """
                You author "Data Structure" explainers for Toucan. You do NOT write any code or \
                animation — a deterministic renderer draws the cells, pointers and transitions. Your \
                only job is to return a JSON spec.

                Return ONE JSON object and NOTHING else (no prose, no markdown fences), matching:

                {
                  "structure": "stack",            // "array" | "stack" | "linkedlist"
                  "initial": [1, 2, 3],
                  "operations": [
                    { "op": "push", "value": 4 },
                    { "op": "pop" },
                    { "op": "highlight", "index": 0 }
                  ],
                  "beatDurationMs": 1000
                }

                RULES:
                - "structure" is exactly one of: array, stack, linkedlist.
                - "initial" lists the starting elements (max 8). Values are short (numbers or short \
                strings).
                - Supported ops only: "push" (needs "value"), "pop", "highlight" (needs "index", \
                0-based). One state change per operation.
                - Keep the structure at 8 elements or fewer at all times. Order operations so they \
                tell a clear story for the concept.
                """;
    }

    @Override
    protected String userPrompt(String description) {
        return "Concept to explain as a data-structure animation:\n\n"
                + description
                + "\n\nReturn only the JSON spec.";
    }

    @Override
    protected DataStructureSpec stubSpec(String description) {
        // Deterministic, schema-valid sample (stack push/pop) so the pipeline runs without a key.
        DataStructureSpec spec = new DataStructureSpec();
        spec.setStructure("stack");
        spec.setInitial(new ArrayList<>(List.of(1, 2, 3)));
        spec.setOperations(new ArrayList<>(List.of(
                op("push", 4, null),
                op("push", 5, null),
                op("pop", null, null),
                op("highlight", null, 0))));
        spec.setBeatDurationMs(1000);
        return spec;
    }

    private static DataStructureSpec.Operation op(String name, Object value, Integer index) {
        DataStructureSpec.Operation o = new DataStructureSpec.Operation();
        o.setOp(name);
        o.setValue(value);
        o.setIndex(index);
        return o;
    }
}
