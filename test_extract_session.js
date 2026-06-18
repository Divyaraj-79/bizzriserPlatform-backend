const {PrismaClient}=require('@prisma/client'); 
const p=new PrismaClient(); 
p.chatbotSession.findUnique({where:{id:'8a8bf70e-d2cf-4127-af7a-11a2612990ab'}})
.then(e=>console.log(e))
.finally(()=>p.$disconnect());
