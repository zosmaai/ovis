### Added
- Choosing a model, and for Pi a thinking level, when a session starts now reaches Pi too: the launch
  carries `--model` and `--thinking`, and a first message typed there is handed over behind `--`, the
  way Codex's already was.

### Fixed
- A Pi pane names its model in Chat from the moment you open it, instead of "No model" until its first
  reply (#2583). Pi keeps its model out of the saved conversation and draws it in its own footer row,
  so until a turn wrote a session header there was nothing to read. The footer is read instead, and
  for a pane that has not spoken yet it is followed as it changes, so changing the model in the
  terminal changes it in Chat.
