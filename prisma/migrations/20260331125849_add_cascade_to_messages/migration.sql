-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_whatsappAccountId_fkey";

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_whatsappAccountId_fkey" FOREIGN KEY ("whatsappAccountId") REFERENCES "whatsapp_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
