package com.toucan_motion.toucan.generation.spec;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.ArrayList;
import java.util.List;

/**
 * Type 3 — Data Structure. Explains operations on a basic data structure, one operation per beat.
 *
 * <p>v0.1 constraints (enforced in {@link #validateAndRepair()}): three structures only ({@code
 * array}, {@code stack}, {@code linkedlist}); small sizes (≤ 8 elements); no trees, graphs or sorting
 * visualisations. Supported ops: {@code push}, {@code pop}, {@code highlight}.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class DataStructureSpec implements AnimationSpec {

    public static final int MAX_ELEMENTS = 8;
    public static final int MAX_OPERATIONS = 16;

    private String type = "datastructure";
    /** {@code array}, {@code stack} or {@code linkedlist}. */
    private String structure = "array";
    private List<Object> initial = new ArrayList<>();
    private List<Operation> operations = new ArrayList<>();
    private Integer beatDurationMs;

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Operation {
        /** {@code push}, {@code pop} or {@code highlight}. */
        private String op;
        private Object value;
        private Integer index;

        public String getOp() {
            return op;
        }

        public void setOp(String op) {
            this.op = op;
        }

        public Object getValue() {
            return value;
        }

        public void setValue(Object value) {
            this.value = value;
        }

        public Integer getIndex() {
            return index;
        }

        public void setIndex(Integer index) {
            this.index = index;
        }
    }

    @Override
    public String wireType() {
        return "datastructure";
    }

    @Override
    public void validateAndRepair() {
        structure = normaliseStructure(structure);

        if (initial == null) {
            initial = new ArrayList<>();
        }
        if (initial.size() > MAX_ELEMENTS) {
            initial = new ArrayList<>(initial.subList(0, MAX_ELEMENTS));
        }

        if (operations == null) {
            operations = new ArrayList<>();
        }
        operations.removeIf(o -> o == null || o.getOp() == null);
        // Keep only supported ops and simulate the running size so we never exceed the cap or pop
        // an empty structure — the renderer assumes every op is applicable in order.
        List<Operation> kept = new ArrayList<>();
        int size = initial.size();
        for (Operation o : operations) {
            String op = o.getOp().strip().toLowerCase();
            switch (op) {
                case "push" -> {
                    if (size >= MAX_ELEMENTS) {
                        continue;
                    }
                    o.setOp("push");
                    size++;
                    kept.add(o);
                }
                case "pop" -> {
                    if (size <= 0) {
                        continue;
                    }
                    o.setOp("pop");
                    o.setValue(null);
                    o.setIndex(null);
                    size--;
                    kept.add(o);
                }
                case "highlight" -> {
                    if (size <= 0) {
                        continue;
                    }
                    int idx = o.getIndex() == null ? 0 : o.getIndex();
                    o.setOp("highlight");
                    o.setIndex(Math.max(0, Math.min(size - 1, idx)));
                    o.setValue(null);
                    kept.add(o);
                }
                default -> {
                    // unsupported op (insert, enqueue, …) — drop it for v0.1
                }
            }
            if (kept.size() >= MAX_OPERATIONS) {
                break;
            }
        }
        operations = kept;

        if (beatDurationMs != null) {
            beatDurationMs = Math.max(300, Math.min(5000, beatDurationMs));
        }
        type = "datastructure";
    }

    private static String normaliseStructure(String s) {
        if (s == null) {
            return "array";
        }
        String v = s.strip().toLowerCase().replace("-", "").replace("_", "").replace(" ", "");
        return switch (v) {
            case "stack" -> "stack";
            case "linkedlist", "list", "ll" -> "linkedlist";
            default -> "array";
        };
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getStructure() {
        return structure;
    }

    public void setStructure(String structure) {
        this.structure = structure;
    }

    public List<Object> getInitial() {
        return initial;
    }

    public void setInitial(List<Object> initial) {
        this.initial = initial;
    }

    public List<Operation> getOperations() {
        return operations;
    }

    public void setOperations(List<Operation> operations) {
        this.operations = operations;
    }

    public Integer getBeatDurationMs() {
        return beatDurationMs;
    }

    public void setBeatDurationMs(Integer beatDurationMs) {
        this.beatDurationMs = beatDurationMs;
    }
}
