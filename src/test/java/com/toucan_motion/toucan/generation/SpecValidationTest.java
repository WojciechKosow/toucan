package com.toucan_motion.toucan.generation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.toucan_motion.toucan.generation.spec.CodeSpec;
import com.toucan_motion.toucan.generation.spec.DataStructureSpec;
import com.toucan_motion.toucan.generation.spec.FlowSpec;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class SpecValidationTest {

    @Test
    void flowClampsToSixNodes() {
        FlowSpec spec = new FlowSpec();
        List<FlowSpec.Node> nodes = new ArrayList<>();
        for (int i = 0; i < 9; i++) {
            FlowSpec.Node n = new FlowSpec.Node();
            n.setLabel("Stage " + i);
            nodes.add(n);
        }
        spec.setNodes(nodes);

        spec.validateAndRepair();

        assertThat(spec.getNodes()).hasSize(FlowSpec.MAX_NODES);
        // ids backfilled and unique
        assertThat(spec.getNodes().get(0).getId()).isNotBlank();
    }

    @Test
    void flowRejectsTooFewNodes() {
        FlowSpec spec = new FlowSpec();
        FlowSpec.Node only = new FlowSpec.Node();
        only.setLabel("Alone");
        spec.setNodes(new ArrayList<>(List.of(only)));

        assertThatThrownBy(spec::validateAndRepair).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void codeRejectsEmptySnippetAndClampsLines() {
        CodeSpec empty = new CodeSpec();
        empty.setCode("   ");
        assertThatThrownBy(empty::validateAndRepair).isInstanceOf(IllegalArgumentException.class);

        CodeSpec spec = new CodeSpec();
        spec.setCode("a\nb");
        CodeSpec.Step step = new CodeSpec.Step();
        step.setRevealLines(new ArrayList<>(List.of(1, 2, 99))); // 99 out of range
        spec.setSteps(new ArrayList<>(List.of(step)));

        spec.validateAndRepair();

        assertThat(spec.getSteps().get(0).getRevealLines()).containsExactly(1, 2);
    }

    @Test
    void dataStructureDropsImpossibleOpsAndNormalisesStructure() {
        DataStructureSpec spec = new DataStructureSpec();
        spec.setStructure("Linked-List");
        spec.setInitial(new ArrayList<>()); // empty
        DataStructureSpec.Operation pop = op("pop", null, null); // can't pop empty -> dropped
        DataStructureSpec.Operation push = op("push", 7, null);
        DataStructureSpec.Operation bogus = op("enqueue", 1, null); // unsupported -> dropped
        spec.setOperations(new ArrayList<>(List.of(pop, push, bogus)));

        spec.validateAndRepair();

        assertThat(spec.getStructure()).isEqualTo("linkedlist");
        assertThat(spec.getOperations()).hasSize(1);
        assertThat(spec.getOperations().get(0).getOp()).isEqualTo("push");
    }

    @Test
    void dataStructureCapsElementsAtEight() {
        DataStructureSpec spec = new DataStructureSpec();
        spec.setStructure("stack");
        spec.setInitial(new ArrayList<>(List.of(1, 2, 3, 4, 5, 6, 7, 8)));
        spec.setOperations(new ArrayList<>(List.of(op("push", 9, null)))); // would exceed cap

        spec.validateAndRepair();

        assertThat(spec.getInitial()).hasSize(DataStructureSpec.MAX_ELEMENTS);
        assertThat(spec.getOperations()).isEmpty();
    }

    private static DataStructureSpec.Operation op(String name, Object value, Integer index) {
        DataStructureSpec.Operation o = new DataStructureSpec.Operation();
        o.setOp(name);
        o.setValue(value);
        o.setIndex(index);
        return o;
    }
}
