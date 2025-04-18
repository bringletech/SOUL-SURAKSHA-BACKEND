/*
  Warnings:

  - Added the required column `IsForStudent` to the `EducationalVideo` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "EducationalVideo" ADD COLUMN     "IsForStudent" BOOLEAN NOT NULL;
