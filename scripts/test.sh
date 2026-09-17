#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
(cd cortes-ia-workers && python3 -m unittest discover -s tests -v)
dotnet test cortes-ia-api/Tests/Cortes.Tests.csproj
(cd cortes-ia-web && npm run typecheck && npm run build)
