param(
    [string]$OutputPath = "E:\Demo\MOO\outputs\screenshots\capture.png"
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# 获取主屏幕工作区域（排除任务栏）
$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$bounds = $screen.WorkingArea

$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()

Write-Output "Screenshot saved to: $OutputPath ($($bounds.Width)x$($bounds.Height))"
