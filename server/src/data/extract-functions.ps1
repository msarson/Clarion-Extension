# Clarion Built-in Function Extractor
# This script helps extract function information from decoded CHM files
# Usage: Run this to get examples of functions you can add to clarion-builtins.json

$chmPath = "C:\Clarion\Clarion11.1\bin\decoded"

Write-Host "=================================="
Write-Host "Clarion Function Documentation Ready!"
Write-Host "=================================="
Write-Host ""
Write-Host "The CHM files have been decoded to: $chmPath"
Write-Host ""
Write-Host "Example functions found:"
Write-Host ""

# List some common function files
$commonFunctions = @(
    "clip__return_string_without_trailing_spaces_.htm",
    "sub__return_substring_of_string_.htm",
    "format__return_formatted_numbers_into_a_picture_.htm",
    "upper__return_upper_case_.htm",
    "lower__return_lower_case_.htm",
    "len__return_string_length_.htm"
)

foreach ($file in $commonFunctions) {
    $fullPath = Join-Path $chmPath $file
    if (Test-Path $fullPath) {
        Write-Host "  - $file"
    }
}

Write-Host ""
Write-Host "To add a function to clarion-builtins.json:"
Write-Host "1. Find the .htm file in: $chmPath"
Write-Host "2. Tell me the function name"
Write-Host "3. I'll extract the signature and add it to the JSON"
Write-Host ""
Write-Host "Ready to start! Just tell me which function you want to add first."
