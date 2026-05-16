/**
 * Dropdown Switch – ComfyUI custom node
 *
 * Frontend-only node. Behaves like a case/switch statement:
 *  - Each input connection has an associated editable label.
 *  - The "choice" combo widget lists all labels.
 *  - Whichever label is selected is the active path.
 *  - Outputs: STRING (the selected label) + * (the value on that input).
 *
 * Compatible with:
 *  - Legacy LiteGraph / classic ComfyUI canvas
 *  - ComfyUI Nodes 2.0 / new frontend API
 *  - App mode
 */

import { app } from "../../../scripts/app.js";

const NODE_TYPE = "DropdownSwitch";
const CATEGORY  = "utils";

// ─── helpers ─────────────────────────────────────────────────────────────────

function getLG() {
  return window.LiteGraph ?? globalThis.LiteGraph;
}

function getApp() {
  try {
    if (app && typeof app.graph !== "undefined") return app;
  } catch (_) { /* ignore */ }
  return window.comfyAPI?.app?.app ?? window.app;
}

// ─── build node class (deferred until LiteGraph is available) ─────────────────

function buildNodeClass(LG) {
  class DropdownSwitchNode extends LG.LGraphNode {
    static title         = "Dropdown Switch";
    static type          = NODE_TYPE;
    static isVirtualNode = true;

  constructor() {
    super("Dropdown Switch");
    this.isVirtualNode     = true;
    this.serialize_widgets = true;
    this.size              = [260, 80];
    this.color             = "#2a3a2a";
    this.bgcolor           = "#1e2a1e";

    this._labels = [];

    // Combo at top – the only widget
    this._choiceWidget = this.addWidget(
      "combo",
      "choice",
      "",
      (v) => this._onChoiceChanged(v),
      { values: [] }
    );

    // First dynamic input slot
    this._addDynamicInput();

    // Static outputs
    this.addOutput("STRING", "STRING");
    this.addOutput("value",  "*");
  }

  // ── input management ───────────────────────────────────────────────────────

  /** Add a new labelled input slot. Label is shown as the slot name. */
  _addDynamicInput(label = "") {
    const idx = this._labels.length;

    // Build a unique name, avoiding collisions with existing labels.
    let iName;
    if (!label) {
      // Auto-generated: find the first unused input_N
      let n = idx + 1;
      while (this._labels.includes(`input_${n}`)) n++;
      iName = `input_${n}`;
    } else if (this._labels.includes(label)) {
      // User-supplied name already taken: append a counter
      let n = 2;
      while (this._labels.includes(`${label} (${n})`)) n++;
      iName = `${label} (${n})`;
    } else {
      iName = label;
    }
    this._labels.push(iName);
    this.addInput(iName, "*");
    this._syncChoiceValues();
    this._autoSize();
    return idx;
  }

  /** Remove the input at position `idx` and its associated label. */
  _removeDynamicInput(idx) {
    if (idx < 0 || idx >= this._labels.length) return;

    if (this.inputs[idx]?.link != null) {
      this.graph?.removeLink(this.inputs[idx].link);
    }

    this._labels.splice(idx, 1);
    this.removeInput(idx);
    this._syncChoiceValues();
    this._autoSize();
  }

  /** Rename a label (slot name and labels array). */
  _renameInput(idx, newLabel) {
    if (idx < 0 || idx >= this._labels.length) return;
    const label = (newLabel || "").trim() || `input_${idx + 1}`;
    this._labels[idx] = label;
    if (this.inputs[idx]) this.inputs[idx].name = label;
    this._syncChoiceValues();
  }

  /** Push current labels into the choice widget and keep selection valid. */
  _syncChoiceValues() {
    if (!this._choiceWidget) return; // widget not yet created (e.g. during constructor)
    const values  = [...this._labels];
    const current = this._choiceWidget.value;

    this._choiceWidget.options.values = values;

    if (values.length === 0) {
      this._choiceWidget.value = "";
      return;
    }
    // Keep existing selection if still present, else default to first
    this._choiceWidget.value = values.includes(current) ? current : values[0];
  }

  _onChoiceChanged(_value) {
    // Nothing to do at design-time; value is serialised automatically.
  }

  _autoSize() {
    const s = this.computeSize();
    this.size[0] = Math.max(this.size[0], s[0]);
    this.size[1] = s[1];
  }

  // ── index helpers ──────────────────────────────────────────────────────────

  /** Index of the currently selected input (0-based). */
  get selectedIndex() {
    const v = this._choiceWidget.value;
    const i = this._labels.indexOf(v);
    return i >= 0 ? i : 0;
  }

  // ── context menu ──────────────────────────────────────────────────────────

  getExtraMenuOptions(_canvas, options) {
    options.push(
      {
        content:  "➕ Add Input",
        callback: () => {
          this._addDynamicInput();
          this.setDirtyCanvas(true, true);
        },
      },
      null, // separator
      ...this._labels.map((lbl, i) => ({
        content:  `✏️ Rename "${lbl}"`,
        callback: () => {
          const newName = prompt(`Rename input "${lbl}" to:`, lbl);
          if (newName !== null) {
            this._renameInput(i, newName);
            this.setDirtyCanvas(true, true);
          }
        },
      })),
      null,
      ...this._labels.map((lbl, i) => ({
        content:  `🗑 Remove "${lbl}"`,
        callback: () => {
          this._removeDynamicInput(i);
          this.setDirtyCanvas(true, true);
        },
      }))
    );
  }

  // ── connection events ─────────────────────────────────────────────────────

  /**
   * Auto-add a new empty slot whenever the last existing slot gets connected.
   * Also clean up any trailing empty (disconnected) slots beyond one.
   */
  onConnectionsChange(type, _slotIndex, _connected, _link, _ioSlot) {
    if (type !== LG.INPUT) return;

    // Remove every empty slot except the one trailing empty.
    // Iterate high → low so earlier indices stay valid after each removal.
    const len = this.inputs.length;
    for (let i = len - 2; i >= 0; i--) {
      if (this.inputs[i] && this.inputs[i].link == null) {
        this._removeDynamicInput(i);
      }
    }

    // Guarantee exactly one trailing empty slot.
    const last = this.inputs[this.inputs.length - 1];
    if (!last || last.link != null) {
      this._addDynamicInput();
    }

    this.setDirtyCanvas(true, true);
  }

  // ── serialisation ─────────────────────────────────────────────────────────

  serialize() {
    const data = super.serialize();
    data.labels = [...this._labels];
    return data;
  }

  configure(data) {
    const savedInputs = data.inputs;
    const savedWV     = data.widgets_values;

    // Clear all constructor-created state so super.configure starts fresh.
    // Clear outputs to prevent duplication (super re-adds them from data.outputs).
    while (this.inputs.length > 0) this.removeInput(0);
    this.outputs        = [];
    this.widgets.length = 0;
    this._labels        = [];
    this._choiceWidget  = null;

    // Restore position, size, id, outputs, properties, etc.
    super.configure({ ...data, inputs: [], widgets_values: [] });

    // Re-create combo widget at top.
    this._choiceWidget = this.addWidget(
      "combo", "choice", "",
      (v) => this._onChoiceChanged(v),
      { values: [] }
    );

    // Determine labels to restore.
    // data.labels is saved explicitly by serialize(); fall back to input names.
    let labels;
    if (data.labels?.length > 0) {
      labels = data.labels;
    } else if (savedInputs?.length > 0) {
      labels = savedInputs.map(i => i.name);
    }
    const toRestore = labels?.length > 0 ? labels : ["input_1"];

    for (const lbl of toRestore) {
      this._addDynamicInput(lbl);
    }

    // Restore link IDs so LiteGraph can reconnect wires when the graph loads.
    // super.configure was called with inputs:[] so it never set these.
    if (savedInputs) {
      for (let i = 0; i < Math.min(savedInputs.length, this.inputs.length); i++) {
        this.inputs[i].link = savedInputs[i]?.link ?? null;
      }
    }

    // widgets_values[0] is the combo value (only widget).
    const desired = savedWV?.[0];
    if (desired && this._labels.includes(desired)) {
      this._choiceWidget.value = desired;
    }

    this._autoSize();
  }

  // ── Nodes 2.0 virtual resolution ────────────────────────────────────────
  /**
   * Called by the new ComfyUI frontend (Nodes 2.0) `resolveOutput` when this
   * node is marked as virtual. Return `{node, slot}` pointing to the real
   * upstream source, or a literal `{value}` for inline values.
   *
   * outputSlot 0 = STRING (return literal label text)
   * outputSlot 1 = value (passthrough the selected input)
   */
  resolveVirtualOutput(outputSlot) {
    if (outputSlot === 0) {
      // STRING output: return the literal selected label
      // The new system handles literal values internally; we signal this by
      // returning null here — the patchGraphToPrompt handles legacy + new.
      return null;
    }
    // value output: return the selected input's connected node
    const selIdx  = this.selectedIndex;
    const inSlot  = this.inputs?.[selIdx];
    if (!inSlot || inSlot.link == null || !this.graph) return null;
    const link = this.graph.links[inSlot.link];
    if (!link) return null;
    const srcNode = this.graph.getNodeById(link.origin_id);
    if (!srcNode) return null;
    return { node: srcNode, slot: link.origin_slot };
  }

  // ── drawing ───────────────────────────────────────────────────────────────

  } // end class DropdownSwitchNode

  return DropdownSwitchNode;
} // end buildNodeClass

// ─── graphToPrompt interception ───────────────────────────────────────────────
function patchGraphToPrompt(comfyApp) {
  const original = comfyApp.graphToPrompt?.bind(comfyApp);
  if (!original) return;

  comfyApp.graphToPrompt = async function (...args) {
    const result = await original(...args);
    if (!result?.output) return result;

    const graph = comfyApp.graph;
    if (!graph) return result;

    const nodeMap = {};
    for (const n of graph._nodes ?? []) {
      nodeMap[n.id] = n;
    }

    /**
     * Recursively follow a (sourceNodeId, outputIndex) pair through any chain
     * of virtual nodes until we reach a real node or a primitive value.
     * Returns { nodeId, outputIndex } for node links, or { value } for literals.
     */
    function resolveOutput(srcId, outIdx, visited = new Set()) {
      if (visited.has(srcId)) return null;
      visited.add(srcId);

      const srcNode = nodeMap[srcId];
      if (!srcNode) return { nodeId: srcId, outputIndex: outIdx };

      if (srcNode.type !== NODE_TYPE) {
        return { nodeId: srcId, outputIndex: outIdx };
      }

      // It IS a DropdownSwitch
      const selIdx = srcNode.selectedIndex;

      if (outIdx === 0) {
        // STRING output → return the literal label
        return { value: srcNode._choiceWidget.value ?? "" };
      }

      // "value" output (outIdx === 1) → follow the selected input
      const inSlot = srcNode.inputs?.[selIdx];
      if (!inSlot || inSlot.link == null) {
        return { value: null }; // nothing connected
      }

      const link = graph.links[inSlot.link];
      if (!link) return { value: null };

      return resolveOutput(link.origin_id, link.origin_slot, visited);
    }

    // Walk every serialised node
    for (const nodeId of Object.keys(result.output)) {
      const serialisedNode = result.output[nodeId];
      const liveNode       = nodeMap[Number(nodeId)];
      if (!liveNode) continue;

      for (let inputIdx = 0; inputIdx < (liveNode.inputs?.length ?? 0); inputIdx++) {
        const inSlot = liveNode.inputs[inputIdx];
        if (inSlot.link == null) continue;

        const link = graph.links[inSlot.link];
        if (!link) continue;

        const originNode = nodeMap[link.origin_id];
        if (!originNode || originNode.type !== NODE_TYPE) continue;

        // This input is fed by a DropdownSwitch → resolve it
        const resolved = resolveOutput(link.origin_id, link.origin_slot);
        if (!resolved) continue;

        if ("value" in resolved) {
          serialisedNode.inputs[liveNode.inputs[inputIdx].name] = resolved.value;
        } else if (resolved.nodeId !== undefined) {
          serialisedNode.inputs[liveNode.inputs[inputIdx].name] = [
            String(resolved.nodeId),
            resolved.outputIndex,
          ];
        }
      }
    }

    return result;
  };
}

// ─── extension registration ───────────────────────────────────────────────────

app.registerExtension({
  name: "DropdownSwitch.Extension",

  registerCustomNodes() {
    const LG = getLG();
    if (!LG) {
      console.error("[DropdownSwitch] LiteGraph not available");
      return;
    }

    const DropdownSwitchNode = buildNodeClass(LG);
    LG.registerNodeType(NODE_TYPE, DropdownSwitchNode);
    DropdownSwitchNode.category = CATEGORY;
    DropdownSwitchNode.title    = "Dropdown Switch";
  },

  // ── Nodes 2.0 / new frontend "setup" hook ─────────────────────────────────
  async setup() {
    const comfyApp = getApp();
    if (!comfyApp) return;

    // Patch graphToPrompt so virtual node links are resolved before execution.
    patchGraphToPrompt(comfyApp);

    // Also make the node available via Nodes 2.0 registration if the API exists.
    if (typeof comfyApp.registerNodeDef === "function") {
      comfyApp.registerNodeDef(NODE_TYPE, {
        display_name: "Dropdown Switch",
        category:     CATEGORY,
        input: {
          required:  {},
          optional:  { input_1: ["*", {}] },
        },
        output:      ["STRING", "*"],
        output_name: ["label",  "value"],
        output_is_list: [false, false],
        description: "Case/switch selector: choose one of several inputs by label.",
      });
    }
  },
});
