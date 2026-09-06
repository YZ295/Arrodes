# WeMM-Embedding vs Mage-VL — Arrodes decision note

Date: 2026-09-06

## What the WeChat release is

The recent WeChat Vision release is WeMM-Embedding, with 2B, 4B, and 9B variants. It maps text, images, videos, visual documents, and interleaved inputs into normalized vectors for retrieval, recommendation, classification, clustering, and multimodal memory. It does not decode a natural-language answer or directly generate Arrodes' structured state and next action. Audio is not supported.

There is also an older WeChatCV project named WeMM / WeMM-Chat, last announced in 2024. That one is a generative Chinese-English image-chat model, but its released line is around the 7B/10B class, uses an older Transformers stack and full BF16 CUDA examples, and has no equivalent proactive streaming design. It is a worse fit than Mage-VL for the current 8 GB Windows target.

Primary sources:

- https://github.com/Tencent/WeMM-Embedding
- https://arxiv.org/abs/2608.24053
- https://github.com/scenarios/WeMM

## What Mage-VL provides

Mage-VL combines a visual encoder with a Qwen3-4B causal decoder. It supports image/video understanding, natural-language or structured generation, and a proactive streaming gate. That makes it a direct fit for “read the screen, state what is happening, give one next step,” although generated state still needs deterministic evidence checks for critical workflows.

Primary sources:

- https://github.com/microsoft/Mage/blob/main/mage_vl/README.md
- https://huggingface.co/microsoft/Mage-VL

## Decision for Arrodes

- Keep Mage-VL as the current local screen-understanding model.
- Do not install or keep WeMM-Embedding resident now. The existing grayscale frame-difference gate is cheaper for deciding whether a screen changed, and the 8 GB GPU has only about 1.66 GB free while the 4-bit Mage-VL sidecar is loaded.
- Reconsider WeMM-Embedding-2B only when Arrodes has a measured need for semantic screenshot retrieval, cross-modal Obsidian memory matching, or robust scene/profile selection that simple hashing and OCR cannot satisfy. Prefer CPU or mutually exclusive GPU scheduling at that point.
- Do not call a cloud model per frame. Escalate only after local retry/profile rules leave low confidence or unresolved uncertainty, or when the task requires fresh external knowledge, long repository context, or substantially harder reasoning. Crop and redact the screenshot and ask for user consent before upload.

## Product tradeoff

This rejects the attractive idea of “one more multimodal model always running.” We lose semantic frame search for now, but gain lower GPU pressure, fewer moving parts, clearer failures, and a shorter path to the first live-screen Arduino acceptance test.
