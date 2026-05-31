# VHS tape for the Terminal Trove / README preview.
# Render with: vhs assets/preview.tape  (produces preview.gif + preview.png)
Output assets/preview.gif

Set Shell "zsh"
Set FontSize 18
Set Width 1180
Set Height 760
Set Padding 28
Set WindowBar Colorful
Set BorderRadius 10
Set TypingSpeed 35ms

# Start clean
Hide
Type "clear"
Enter
Show
Sleep 800ms

# 1. Verify a citation — the fabrication-detection wedge (real DOI, wrong title)
Type `scholar verify --title "A fabricated title" --doi "10.1016/S0140-6736(26)00603-3" --quiet`
Enter
Sleep 4s

# 2. Format a citation (Vancouver, the default style)
Type `scholar format "10.1016/S0140-6736(26)00603-3" --style vancouver --quiet`
Enter
Sleep 3500ms

# 3. Open-access check
Type `scholar oa "10.1016/S0140-6736(26)00603-3" --quiet`
Enter
Sleep 3500ms

# Capture the still frame for the required PNG
Screenshot assets/preview.png
Sleep 1500ms
