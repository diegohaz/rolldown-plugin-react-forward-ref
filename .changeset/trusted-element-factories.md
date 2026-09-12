---
"rolldown-plugin-react-forward-ref": minor
---

Add `elementFactories` to allow ref adaptation for components passed to trusted element helpers. Strings match a local helper name at argument 0. Import descriptors match an exact source and export name, with an optional `argumentIndex`. Direct calls, constructors, other arguments, and unknown helpers still prevent adaptation.
