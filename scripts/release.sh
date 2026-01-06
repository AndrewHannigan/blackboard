#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get current version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${YELLOW}Current version: ${CURRENT_VERSION}${NC}"

# Ask for new version
read -p "Enter new version (or press enter for ${CURRENT_VERSION}): " NEW_VERSION
NEW_VERSION=${NEW_VERSION:-$CURRENT_VERSION}

# Update package.json version
if [ "$NEW_VERSION" != "$CURRENT_VERSION" ]; then
    npm version $NEW_VERSION --no-git-tag-version
    echo -e "${GREEN}Updated package.json to version ${NEW_VERSION}${NC}"
fi

# Confirm before proceeding
echo ""
echo -e "${YELLOW}This will:${NC}"
echo "  1. Commit any pending changes"
echo "  2. Create tag v${NEW_VERSION}"
echo "  3. Push branch and tags to origin"
echo "  4. GitHub Actions will then build, release, and update homebrew-tap"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Aborted.${NC}"
    exit 1
fi

# Check for uncommitted changes and commit them
if [[ -n $(git status -s) ]]; then
    git add -A
    git commit -m "Release v${NEW_VERSION}"
    echo -e "${GREEN}Committed changes${NC}"
fi

# Create and push tag
git tag -a "v${NEW_VERSION}" -m "Release v${NEW_VERSION}"
echo -e "${GREEN}Created tag v${NEW_VERSION}${NC}"

# Push branch and tags
BRANCH=$(git branch --show-current)
git push origin $BRANCH
git push origin "v${NEW_VERSION}"
echo -e "${GREEN}Pushed branch and tag to origin${NC}"

echo ""
echo -e "${GREEN}🚀 Release initiated!${NC}"
echo -e "GitHub Actions will now:"
echo "  - Build the app on macOS"
echo "  - Create a GitHub release with artifacts"
echo "  - Update your homebrew-tap"
echo ""
echo -e "Watch progress at: ${YELLOW}https://github.com/$(git remote get-url origin | sed 's/.*github.com[:\/]\(.*\)\.git/\1/')/actions${NC}"

