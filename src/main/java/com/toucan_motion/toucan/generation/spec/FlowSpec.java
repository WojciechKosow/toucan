package com.toucan_motion.toucan.generation.spec;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.ArrayList;
import java.util.List;

/**
 * Type 1 — Sequential Flow (the hero type). Explains how something moves through an ordered series of
 * stages: a single traveler hops along a linear chain of 3–6 nodes.
 *
 * <p>v0.1 constraints (enforced in {@link #validateAndRepair()}): linear only — no branching,
 * parallel paths or loops back; 3–6 nodes; a single traveler.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class FlowSpec implements AnimationSpec {

    public static final int MIN_NODES = 3;
    public static final int MAX_NODES = 6;

    private String type = "flow";
    private String title;
    /** {@code "horizontal"} (default) or {@code "vertical"}. */
    private String direction = "horizontal";
    private List<Node> nodes = new ArrayList<>();
    private Traveler traveler;
    private Integer beatDurationMs;

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Node {
        private String id;
        private String label;
        private String sublabel;

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public String getLabel() {
            return label;
        }

        public void setLabel(String label) {
            this.label = label;
        }

        public String getSublabel() {
            return sublabel;
        }

        public void setSublabel(String sublabel) {
            this.sublabel = sublabel;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Traveler {
        private String label;
        /** v0.1 renders a {@code "dot"}; other values fall back to a dot. */
        private String shape = "dot";

        public String getLabel() {
            return label;
        }

        public void setLabel(String label) {
            this.label = label;
        }

        public String getShape() {
            return shape;
        }

        public void setShape(String shape) {
            this.shape = shape;
        }
    }

    @Override
    public String wireType() {
        return "flow";
    }

    @Override
    public void validateAndRepair() {
        if (nodes == null) {
            nodes = new ArrayList<>();
        }
        // Drop nodes with no usable label, then enforce the 3–6 window.
        nodes.removeIf(n -> n == null || n.getLabel() == null || n.getLabel().isBlank());
        if (nodes.size() < MIN_NODES) {
            throw new IllegalArgumentException(
                    "A flow needs at least " + MIN_NODES + " labelled nodes; got " + nodes.size());
        }
        if (nodes.size() > MAX_NODES) {
            nodes = new ArrayList<>(nodes.subList(0, MAX_NODES));
        }
        // Guarantee unique, non-blank ids so connectors can be addressed deterministically.
        for (int i = 0; i < nodes.size(); i++) {
            Node n = nodes.get(i);
            if (n.getId() == null || n.getId().isBlank()) {
                n.setId("n" + i);
            }
            n.setLabel(n.getLabel().strip());
            if (n.getSublabel() != null && n.getSublabel().isBlank()) {
                n.setSublabel(null);
            }
        }
        if (!"vertical".equalsIgnoreCase(direction)) {
            direction = "horizontal";
        } else {
            direction = "vertical";
        }
        if (traveler == null) {
            traveler = new Traveler();
        }
        if (traveler.getShape() == null || traveler.getShape().isBlank()) {
            traveler.setShape("dot");
        }
        if (beatDurationMs != null && (beatDurationMs < 300 || beatDurationMs > 4000)) {
            beatDurationMs = Math.max(300, Math.min(4000, beatDurationMs));
        }
        if (title != null && title.isBlank()) {
            title = null;
        }
        type = "flow";
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDirection() {
        return direction;
    }

    public void setDirection(String direction) {
        this.direction = direction;
    }

    public List<Node> getNodes() {
        return nodes;
    }

    public void setNodes(List<Node> nodes) {
        this.nodes = nodes;
    }

    public Traveler getTraveler() {
        return traveler;
    }

    public void setTraveler(Traveler traveler) {
        this.traveler = traveler;
    }

    public Integer getBeatDurationMs() {
        return beatDurationMs;
    }

    public void setBeatDurationMs(Integer beatDurationMs) {
        this.beatDurationMs = beatDurationMs;
    }
}
