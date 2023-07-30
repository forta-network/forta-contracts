# Unlock admin proposals

This is useful to us when we want to create Unlock admin proposals for the council multisig to sign.

To create Unlock admin proposals:
1. Get a team API key from Defender and set it inside the project root `.env` file.
```
DEFENDER_API_KEY=<your-defender-api-key>
DEFENDER_SECRET_KEY=<your-defender-secret-key>
```
2. Create a new proposal file (like in scripts/unlock-admin/example.yaml).
3. At the project root, do `npm run unlock:propose -- <proposal-file-path>`.
4. Follow the links in the output to verify that the proposals were created in Defender.
