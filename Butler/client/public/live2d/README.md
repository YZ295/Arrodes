# Arrodes 自定义 Live2D 资源

这里目前没有已绑定模型。不要用示例角色替代用户指定人物。

交付目录：

```
core/live2dcubismcore.min.js
arrodes/arrodes.model3.json
arrodes/arrodes.moc3
arrodes/textures/texture_00.png
arrodes/arrodes.physics3.json
arrodes/expressions/*.exp3.json
arrodes/motions/*.motion3.json
```

从官方 SDK 获取与导出模型版本兼容、许可允许使用的 Cubism Core 后放入 core 目录。此仓库不自动下载或接受 SDK 条款。
模型路径在 client/.env.local 中配置 `VITE_PET_MODEL_URL=/live2d/arrodes/arrodes.model3.json`，然后重新构建客户端。
未配置时保持现有 PNG；配置后加载失败仍回退 PNG。不可把 JSON 清单当作 moc3 模型。

现有播放端表达式别名：f01=肯定，f02=思考，f03=疑惑，f04=错误；点击动作组 TapBody/Shake/Head；Idle 用于待机。绑定时应提供这些名字，或同步调整播放端映射。
口型使用 ParamMouthOpenY，由桌宠自身 TTS 输出驱动；用户录音不会让角色张嘴。
