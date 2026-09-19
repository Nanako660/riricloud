-- CreateTable
CREATE TABLE "HelpArticle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'ALL',
    "clientName" TEXT,
    "icon" TEXT,
    "summary" TEXT,
    "content" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "locale" TEXT NOT NULL DEFAULT 'zh-CN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "HelpArticle_slug_key" ON "HelpArticle"("slug");

-- CreateIndex
CREATE INDEX "HelpArticle_platform_isPublished_sortOrder_idx" ON "HelpArticle"("platform", "isPublished", "sortOrder");

-- CreateIndex
CREATE INDEX "HelpArticle_locale_isPublished_idx" ON "HelpArticle"("locale", "isPublished");

-- CreateIndex
CREATE INDEX "HelpArticle_sortOrder_idx" ON "HelpArticle"("sortOrder");
