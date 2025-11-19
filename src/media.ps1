try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null

    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
        Where-Object {
            $_.Name -eq 'AsTask' -and
            $_.GetParameters().Count -eq 1 -and
            $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
        })[0]

    function Await($WinRtTask, $ResultType) {
        $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
        $netTask = $asTask.Invoke($null, @($WinRtTask))
        $netTask.Wait(-1) | Out-Null
        $netTask.Result
    }

    $sessionManager = Await (
        [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
    ) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

    if (!$sessionManager) { Write-Output "ERROR: No session manager"; exit }

    $session = $sessionManager.GetCurrentSession()
    if (!$session) { Write-Output "ERROR: No current session"; exit }

    $mediaProperties = Await (
        $session.TryGetMediaPropertiesAsync()
    ) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])

    $playbackInfo = $session.GetPlaybackInfo()

    if ($mediaProperties) {
        $artist = $mediaProperties.Artist
        if (!$artist) { $artist = "Unknown Artist" }
        $title  = $mediaProperties.Title
        if (!$title) { $title = "Unknown Track" }
        $status = $playbackInfo.PlaybackStatus
        if ($status -eq "None") { $status = "0" }
        Write-Output "$artist|$title|$status"
    } else {
        Write-Output "ERROR: No media properties"
    }
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
}
