# Byte migration, step 1 (Windows): export the Byte tables we import from a READ-ONLY copy of Byte_Data_2014
# attached to SQL Server LocalDB (D-71). Each .sql file next to this script becomes <name>.json in -Out.
# Never point this at the shop's live server.
#   powershell -File export.ps1 -Instance jcmig -Database ByteCopy -Out <folder outside the repo>
param([string]$Instance = "jcmig", [string]$Database = "ByteCopy", [Parameter(Mandatory = $true)][string]$Out)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$cn = New-Object System.Data.SqlClient.SqlConnection "Server=(localdb)\$Instance;Database=$Database;Integrated Security=true;Connect Timeout=60;ApplicationIntent=ReadOnly"
$cn.Open()
try {
  # The connection can only reach LocalDB (a copy), never the shop's server. Keep that copy read-only before reading.
  $ro = $cn.CreateCommand(); $ro.CommandText = "IF DATABASEPROPERTYEX(DB_NAME(), 'Updateability') <> 'READ_ONLY' BEGIN DECLARE @s nvarchar(300) = N'USE master; ALTER DATABASE ' + QUOTENAME(DB_NAME()) + N' SET READ_ONLY WITH ROLLBACK IMMEDIATE'; EXEC (@s) END"
  $ro.ExecuteNonQuery() | Out-Null
  foreach ($f in Get-ChildItem -Path $PSScriptRoot -Filter *.sql | Sort-Object Name) {
    $cmd = $cn.CreateCommand(); $cmd.CommandText = Get-Content -Raw -Encoding UTF8 $f.FullName; $cmd.CommandTimeout = 600
    $t = New-Object System.Data.DataTable
    (New-Object System.Data.SqlClient.SqlDataAdapter $cmd).Fill($t) | Out-Null
    $rows = foreach ($r in $t.Rows) { $o = [ordered]@{}; foreach ($c in $t.Columns) { $v = $r[$c]; $o[$c.ColumnName] = if ($v -is [System.DBNull]) { $null } else { $v } }; $o }
    $json = ConvertTo-Json -InputObject @($rows) -Depth 3 -Compress
    [System.IO.File]::WriteAllText((Join-Path $Out ($f.BaseName + ".json")), $json, (New-Object System.Text.UTF8Encoding $false))
    "{0,-12} {1,7} rows" -f $f.BaseName, $t.Rows.Count
  }
} finally { $cn.Close() }
