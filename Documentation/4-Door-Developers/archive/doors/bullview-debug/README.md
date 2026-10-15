# BullView Debug Door (TypeScript)

Minimal TS door that mirrors BullView’s XIM flow for debugging:

- DoorStart(node): FindPort `AEDoorPort<n>`, create `DoorReplyPort<n>`, seed message (Command=JH_REGISTER, Data=0, String="") and Transfer().
- Transfer(): PutMsg -> WaitPort -> GetMsg with full jhMessage dumps (cmd, data, string, reply port, node, line, signal, task).
- Simple prompt (JH_LI-like) to exercise IO, then shutdown.

Use this to compare behavior against 68k Bulls and validate AEDoor/XIM handshake.
