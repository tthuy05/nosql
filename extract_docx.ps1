Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path "DOAN_NoSQL.docx"))
$entry = $zip.GetEntry('word/document.xml')
$stream = $entry.Open()
$reader = New-Object System.IO.StreamReader($stream)
$xmlContent = $reader.ReadToEnd()
$reader.Close()
$stream.Close()
$zip.Dispose()

[xml]$doc = $xmlContent
$nsmgr = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
$nsmgr.AddNamespace("w", "http://schemas.openxmlformats.org/wordprocessingml/2006/main")
$paragraphs = $doc.SelectNodes("//w:p", $nsmgr)
$lines = @()

foreach ($p in $paragraphs) {
    $texts = $p.SelectNodes(".//w:t", $nsmgr)
    $pText = ""
    foreach ($t in $texts) {
        $pText += $t.InnerText
    }
    if ($pText.Trim().Length -gt 0) {
        $lines += $pText
    }
}

[System.IO.File]::WriteAllLines("DOAN_NoSQL_extracted.txt", $lines, [System.Text.Encoding]::UTF8)
Write-Output "Extracted $($lines.Count) lines."
