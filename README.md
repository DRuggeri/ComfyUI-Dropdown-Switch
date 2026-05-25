# ComfyUI Dropdown Switch

A frontend-only custom node for [ComfyUI](https://github.com/comfyanonymous/ComfyUI) that acts as a case/switch selector.

## What it does

Connect multiple upstream nodes to the **Dropdown Switch**, assign each connection a label, then pick which one is active from the dropdown. Only the selected path is forwarded to downstream nodes.

**Outputs**

| Output | Type | Description |
|--------|------|-------------|
| `STRING` | STRING | The label text of the currently selected input |
| `value` | `*` | The value on the selected input |

## Installation

### Via ComfyUI Manager (recommended)
Search for **Dropdown Switch** in the Custom Nodes list and install.

### Manual
```bash
cd ComfyUI/custom_nodes
git clone https://github.com/YOUR_USERNAME/ComfyUI-Dropdown-Switch
```
No extra dependencies — this is a frontend-only node with no Python packages required.

## Usage

1. **Add node** — right-click canvas → *Add Node* → *utils* → *Dropdown Switch*
2. **Connect inputs** — wire any upstream nodes into the input slots; a new empty slot appears automatically as you connect
3. **Rename labels** — right-click the node → *Rename "input_N"* to give each path a meaningful name
4. **Select active path** — choose from the *choice* dropdown; the `value` output will carry that input's data
5. **Add/remove inputs** — right-click the node → *Add Input* or *Remove "label"*

## Compatibility

- ComfyUI classic canvas (legacy LiteGraph)
- ComfyUI Nodes 2.0 / new frontend API
- App mode

## License

Apache 2.0 — see [LICENSE](LICENSE).
