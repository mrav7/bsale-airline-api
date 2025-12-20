$base = "http://localhost:3001"
$checked = 0
$ok = 0
$bad = 0

1..300 | ForEach-Object {
  $id = $_
  try {
    $j = (curl.exe -s "$base/flights/$id/passengers" | ConvertFrom-Json)
    if ($j.code -eq 200) {
      $checked++
      $nulls = ($j.data.passengers | Where-Object { $_.seatId -eq $null }).Count

      if ($nulls -gt 0) {
        $bad++
        Write-Host ("Vuelo {0}: seatId null = {1}" -f $id, $nulls)
      } else {
        $ok++
      }
    }
  } catch {
    Write-Host ("Vuelo {0}: error al consultar" -f $id)
  }
}

Write-Host ("Vuelos con code=200 revisados: {0}" -f $checked)
Write-Host ("OK (sin null): {0}" -f $ok)
Write-Host ("Con null: {0}" -f $bad)
