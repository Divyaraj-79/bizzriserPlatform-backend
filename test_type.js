const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.chatbot.findUnique({where:{id:'8f8e0a7b-03f2-4de2-9109-5602326db3a2'}})
.then(c=>{
  const n = c.flowData.nodes.find(n=>n.id==='sendData-1779964651578');
  console.log("Type:", n.type);
})
.finally(()=>p.$disconnect());
