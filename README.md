# PotPlayer FTA

这个独立仓库用于在 Windows 11 24H2、25H2 的 `UserChoiceLatest` 机制下，批量把 PotPlayer 已注册的视频扩展名设置为当前用户的默认打开应用。

## 使用

在 PowerShell 中进入仓库目录后运行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.PotPlayerFTA.ps1 -Action List
.PotPlayerFTA.ps1 -Action Verify
.PotPlayerFTA.ps1 -Action Set
```

只处理指定格式：

```powershell
.PotPlayerFTA.ps1 -Action Set -Extensions .mp4,.mkv,.avi,.mov,.webm
```

脚本默认使用快捷方式指向的 PotPlayer 路径 `D:\soft\player\PotPlayer\PotPlayerMini64.exe`。如果播放器目录不同，可以传入 `-PlayerPath`。脚本从 PotPlayer 的注册信息读取 ProgID，因此不会凭空创建格式关联。

`Set` 完成后会立即调用 `Verify`，验证 Windows 当前返回的 ProgID。随后可以在资源管理器中双击视频确认实际打开的程序。

## 机制

`SFTA.ps1` 来自 [ComoEstaisAmigos/PS-SFTA](https://github.com/ComoEstaisAmigos/PS-SFTA) 的 UserChoiceLatest 分支。它同时写入新版 `UserChoiceLatest` 和旧版 `UserChoice`，并在写入前运行自检。新版哈希包含当前用户、机器和关联时间，不能通过简单修改注册表值绕过。

普通视频扩展名不需要管理员权限。Windows 在不同版本上可能由 UCPD 保护少数类型，脚本会在写入失败时报告具体原因，不会静默宣称成功。

## 来源与许可

`SFTA.ps1` 保留上游版权和 MIT 许可声明。PotPlayerFTA 的新增代码采用 MIT 许可。
