git checkout asus
if ($LASTEXITCODE -ne 0) { git checkout -b asus }
git add .
git commit -m "chore: update currency system and remove features"
git checkout main
git merge asus
git push origin main
git push origin asus
