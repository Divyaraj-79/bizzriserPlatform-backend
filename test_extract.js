const {PrismaClient}=require('@prisma/client'); 
const p=new PrismaClient(); 
p.webhookEvent.findFirst({where:{id:'ea0156a1-77ec-42c7-9724-026d2feab77f'}})
.then(e=>console.log(e))
.finally(()=>p.$disconnect());
