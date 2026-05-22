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

  getExtraMenuOptions(canvas, options) {
    // ── Slot-specific options (move / insert) ──────────────────────────────
    // Detect which input slot the right-click landed on.
    const mouse = canvas?.graph_mouse;
    const slotH = LG.NODE_SLOT_HEIGHT ?? 20;
    let hoveredSlot = -1;
    if (mouse) {
      // Exclude the trailing empty slot (always last)
      for (let i = 0; i < this.inputs.length - 1; i++) {
        const pos = this.getConnectionPos(true, i);
        if (Math.abs(pos[1] - mouse[1]) < slotH * 0.65) {
          hoveredSlot = i;
          break;
        }
      }
    }

    if (hoveredSlot >= 0) {
      const lbl = this._labels[hoveredSlot] ?? `slot ${hoveredSlot}`;
      options.push(
        { content: `✏️ Rename "${lbl}"`,
          callback: () => {
            const newName = prompt(`Rename input "${lbl}" to:`, lbl);
            if (newName !== null) {
              this._renameInput(hoveredSlot, newName);
              this.setDirtyCanvas(true, true);
            }
          } },
        { content: `📌 Insert above "${lbl}"`,
          callback: () => this._insertInputAt(hoveredSlot) },
      );
      if (hoveredSlot > 0) {
        options.push(
          { content: `↑ Move "${lbl}" up`,
            callback: () => this._moveInput(hoveredSlot, hoveredSlot - 1) },
        );
      }
      if (hoveredSlot < this.inputs.length - 2) {
        options.push(
          { content: `↓ Move "${lbl}" down`,
            callback: () => this._moveInput(hoveredSlot, hoveredSlot + 1) },
        );
      }
      options.push(null); // separator before global options
    }

    // ── Global options ─────────────────────────────────────────────────────
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

  // ── input reordering & insertion ──────────────────────────────────────────

  /** Swap two input slots, keeping graph link references consistent. */
  _moveInput(fromIdx, toIdx) {
    if (fromIdx === toIdx) return;
    const len = this.inputs.length;
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= len || toIdx >= len) return;

    // Swap the slot objects (each carries .name, .type, .link)
    [this.inputs[fromIdx], this.inputs[toIdx]] =
      [this.inputs[toIdx], this.inputs[fromIdx]];

    // Swap labels
    [this._labels[fromIdx], this._labels[toIdx]] =
      [this._labels[toIdx], this._labels[fromIdx]];

    // Update every graph link that targets this node
    for (const link of Object.values(this.graph?.links ?? {})) {
      if (link.target_id !== this.id) continue;
      if      (link.target_slot === fromIdx) link.target_slot = toIdx;
      else if (link.target_slot === toIdx)   link.target_slot = fromIdx;
    }

    // Re-sync combo, preserving the currently selected label by name
    const sel = this._choiceWidget?.value;
    this._syncChoiceValues();
    if (sel != null && this._labels.includes(sel)) this._choiceWidget.value = sel;

    this.setDirtyCanvas(true, true);
  }

  /** Insert a new empty input slot at position i, shifting later slots down. */
  _insertInputAt(i) {
    // Find a unique label
    let n = 1;
    while (this._labels.includes(`input_${n}`)) n++;
    const newName = `input_${n}`;

    // addInput always appends; pop it off the end and splice into position
    this.addInput(newName, "*");
    const newSlot = this.inputs.pop();
    this.inputs.splice(i, 0, newSlot);
    this._labels.splice(i, 0, newName);

    // Slots that were at index >= i are now at index >= i+1
    for (const link of Object.values(this.graph?.links ?? {})) {
      if (link.target_id !== this.id) continue;
      if (link.target_slot >= i) link.target_slot++;
    }

    const sel = this._choiceWidget?.value;
    this._syncChoiceValues();
    if (sel != null && this._labels.includes(sel)) this._choiceWidget.value = sel;

    this._autoSize();
    this.setDirtyCanvas(true, true);
  }

  // ── connection events ─────────────────────────────────────────────────────

  /**
   * Auto-add a new empty slot whenever the last existing slot gets connected.
   * Also clean up any trailing empty (disconnected) slots beyond one.
   */
  onConnectionsChange(type, _slotIndex, connected, _link, _ioSlot) {
    if (type !== LG.INPUT) return;
    // Any connection change: ensure there is still a trailing empty slot.
    // We never auto-remove slots because they may be empty-but-labelled options
    // the user deliberately added (e.g. 40 model options where only one is wired).
    this._cleanupInputSlots();
  }

  _cleanupInputSlots() {
    // Only guarantee there is at least one trailing empty slot.
    // Empty slots are NEVER auto-removed — the user explicitly created them
    // as labelled options and they must persist even when not connected.
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
    const graph = comfyApp.graph;

    // ── Capture full workflow state BEFORE nulling any links ─────────────────
    // graphToPrompt() returns { workflow, output }.  workflow is what ComfyUI
    // saves to disk / history.  We must capture it with all links intact so
    // the saved file can be reloaded correctly.
    const fullWorkflow = graph?.serialize ? graph.serialize() : null;

    // ── Pre-serialise: disconnect unselected inputs ──────────────────────────
    // Temporarily null out the link IDs for every unselected DropdownSwitch
    // input before calling graphToPrompt.  This ensures ComfyUI's serialiser
    // never traverses to those upstream nodes, so their subgraph internals
    // won't appear in result.output and the backend won't execute them.
    const savedLinks = [];
    if (graph) {
      for (const n of graph._nodes ?? []) {
        if (n.type !== NODE_TYPE || !n._choiceWidget) continue;
        const selIdx = n.selectedIndex;
        for (let i = 0; i < (n.inputs?.length ?? 0); i++) {
          if (i === selIdx) continue;
          const inp = n.inputs[i];
          if (inp?.link != null) {
            savedLinks.push({ inp, link: inp.link });
            inp.link = null;
          }
        }
      }
    }

    let result;
    try {
      result = await original(...args);
    } finally {
      // Always restore, even if original() throws.
      for (const { inp, link } of savedLinks) {
        inp.link = link;
      }
    }

    // ── Restore full workflow in the result ──────────────────────────────────
    // original() serialised the graph with our nulled links, so result.workflow
    // would have only the selected link.  Replace it with the pre-captured full
    // state so that ComfyUI saves (history, auto-save, Ctrl+S) preserve all
    // connections and the workflow reloads correctly.
    if (result?.workflow && fullWorkflow) {
      result.workflow = fullWorkflow;
    }

    if (!result?.output) return result;
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
          // Only rewrite the link if the resolved target is a real backend node
          // (present in result.output). If it isn't — e.g. it's a subgraph or
          // another virtual node — leave the entry alone so ComfyUI's own
          // virtual-node resolution can handle it correctly.
          if (result.output[String(resolved.nodeId)]) {
            serialisedNode.inputs[liveNode.inputs[inputIdx].name] = [
              String(resolved.nodeId),
              resolved.outputIndex,
            ];
          }
        }
      }
    }

    // ── Phase 2: GC – prune nodes unreachable from any output node ──────────
    // Subgraph expansion is unconditional: all internal nodes appear in
    // result.output regardless of whether the subgraph container is connected.
    // Pre-serialisation link-nulling alone cannot prevent this.  Instead we do
    // a backward reachability traversal from every OUTPUT_NODE=True node in the
    // serialised graph and delete anything that isn't reachable.
    {
      // ── Find which class_types are output nodes (try several strategies) ──
      const outputClassTypes = new Set();

      // Strategy 1: LiteGraph registered_node_types (classic frontend)
      const LG_ref = getLG();
      if (LG_ref?.registered_node_types) {
        for (const [type, cls] of Object.entries(LG_ref.registered_node_types)) {
          if (cls?.output_node || cls?.nodeData?.output_node) outputClassTypes.add(type);
        }
      }

      // Strategy 2: comfyApp.nodeOutputTypes Set (newer ComfyUI frontend)
      if (comfyApp?.nodeOutputTypes) {
        for (const t of comfyApp.nodeOutputTypes) outputClassTypes.add(t);
      }

      // Strategy 3: inspect constructor of live top-level graph nodes
      // output_node lives at constructor.nodeData.output_node in this ComfyUI build
      for (const n of graph._nodes ?? []) {
        if (n.constructor?.output_node || n.constructor?.nodeData?.output_node) outputClassTypes.add(n.type);
      }

      if (outputClassTypes.size > 0) {
        const reachable = new Set();
        const markReachable = (nodeId) => {
          if (reachable.has(nodeId)) return;
          reachable.add(nodeId);
          const nd = result.output[nodeId];
          if (!nd) return;
          for (const v of Object.values(nd.inputs ?? {})) {
            if (Array.isArray(v) && v.length >= 2 && typeof v[0] === "string") {
              markReachable(v[0]);
            }
          }
        };

        let outputNodeCount = 0;
        for (const [nodeId, nd] of Object.entries(result.output)) {
          // Only seed GC from top-level nodes (those in the live graph's nodeMap).
          // Subgraph-internal nodes have colon-format IDs like "642:638"; those
          // won't resolve in nodeMap, so their internal output nodes (SaveImage,
          // audio outputs, etc.) don't anchor the whole unselected subgraph branch
          // as "reachable" and those nodes get pruned correctly.
          if (!nodeMap[Number(nodeId)]) continue;
          if (outputClassTypes.has(nd.class_type)) {
            outputNodeCount++;
            markReachable(nodeId);
          }
        }

        if (outputNodeCount > 0) {
          let pruned = 0;
          for (const nodeId of Object.keys(result.output)) {
            if (!reachable.has(nodeId)) {
              delete result.output[nodeId];
              pruned++;
            }
          }
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
