# Frontend Widget and Promotion Notes

This repository implements `DropdownSwitch` entirely in the frontend. Its behavior depends on ComfyUI's LiteGraph node lifecycle and widget-input/subgraph integration; recheck these contracts when upgrading ComfyUI or `comfyui-frontend-package`.

The findings below were checked against the local `comfyui-frontend-package==1.53.6` source maps and saved App Mode workflows. Frontend internals are version-sensitive, especially the Primitive widget-config symbol and promoted-widget storage.

## Widget Forms

### Inline node widget and classic canvas

`DropdownSwitch` owns one real `combo` widget named `choice`, stored as `_choiceWidget`. The node's first input is also named `choice`; its `widget` property binds that slot to the widget. This lets the normal LiteGraph canvas display and serialize the combo while the remaining inputs represent selectable values.

Keep the configured input slot objects when loading a workflow. They carry link and frontend metadata; clearing and rebuilding the inputs can lose restored connections or promotion state. Restore the widget reference by its stable name after `super.configure(data)`, and preserve `widgets_values[0]` when it is a valid label.

### Primitive-connected widget input

ComfyUI's Primitive node asks the target input for widget configuration. The frontend's `widgetInputs` integration reads a private Symbol-keyed getter from `input.widget`; a combo configuration is represented by an array of allowed values. This node currently discovers the Symbol by probing `comfyAPI.widgetInputs.setWidgetConfig` with a Proxy, then installs a getter returning the current `_labels`.

This is an internal frontend contract, not a stable public API. When changing this integration, verify that a Primitive connected to `choice` receives the current labels as a combo and that its selected value drives prompt generation.

## Subgraph Promotion

### Nodes 2.0 subgraph inputs

In the current frontend, a promoted widget is represented on the host `SubgraphNode` as an input slot. The host slot has promotion identity (`widgetId`), an internal subgraph-slot association (`_subgraphSlot`), and a projected widget (`_widget`). The host's `widgets` getter includes projections for promoted inputs. The frontend store is authoritative for the host value; the projected widget exposes that value through the normal widget interface.

The host slot's `widget.name` is the stable widget/input name used to bind the promoted control. The current frontend sets it from the subgraph input name. Do not replace host input slots or discard their `widgetId`, `_subgraphSlot`, `_widget`, or link data while configuring a node. A child's serialized `widget: { name: "choice" }` descriptor is distinct from the host slot's promotion identity.

### App Mode value flow

App Mode presents controls from the workflow's exposed/promoted inputs rather than relying on the internal child node's visible combo. A child input connected to a subgraph input may have a link whose origin is a special subgraph input node, not a regular node returned by `graph.getNodeById()`. Therefore, a missing origin node does not mean the input is disconnected.

For an unconnected promoted `choice`, read the host input's projected widget value (the current implementation finds it in `outerNode.widgets` by the stable widget name). If the host input is connected from outside, follow its link and read the upstream widget value instead. While generating a prompt, apply that value temporarily to the child combo so virtual-output selection uses it, and restore the child's original value in `finally`. Recurse through nested subgraphs while retaining the parent `SubgraphNode` context.

Do not infer promotion state solely from `input.widget`, and do not disable the combo merely because its input has a link: an internal subgraph-input link is not equivalent to a real upstream node such as a Primitive.

## Required Regression Checks

Any change to widget setup, `configure()`, serialization, connection handling, virtual-output resolution, or prompt generation must be checked in **both classic mode and App Mode**. Confirm all of the following:

- A classic workflow loads with a Primitive connected to `choice`; the Primitive exposes the current labels and controls the selected branch.
- A top-level workflow loads with every Dropdown Switch input link intact, including unselected branches.
- A node inside a subgraph can promote `choice`; after loading, the promoted control is present and interactive in App Mode.
- Changing the App Mode promoted choice changes the executed branch, including when the promoted input is externally connected.
- Executing does not disconnect any inputs in either mode; save and reload afterward and verify connections and promotion still exist.

The App Mode promotion fixes in history are useful context: `7d57917` introduced subgraph widget promotion, `f691ef3` kept the choice interactive when promoted, and `8008170` fixed selection propagation through nested subgraphs. Recheck those behaviors after frontend upgrades; passing a JavaScript syntax check alone does not establish mode compatibility.
