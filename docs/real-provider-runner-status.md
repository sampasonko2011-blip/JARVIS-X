# Evaluation runner implementation status

- `npm run evaluate:offline` is a network-free self-test of fixture loading, paired score aggregation, manifest hashing, and report serialization.
- Its outcomes are synthetic plumbing fixtures. They are not model responses and must never be interpreted as model quality or fusion superiority.
- `npm run evaluate:providers` currently fails closed. No provider adapter or live network dispatch is implemented in this milestone.
- The next milestone is a provider adapter contract plus usage accounting that can enforce a hard cost ceiling before requests are sent.
- Keep live provider calls out of ordinary CI. Use only public/synthetic tasks and explicitly approved credentials.
