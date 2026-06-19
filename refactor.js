const fs = require('fs');
const path = 'd:/BizzRiser/BizzRiserPlatform/backend/src/modules/chatbots/executor/flow-executor.service.ts';
let code = fs.readFileSync(path, 'utf8');

const helperMethod = 
  private async saveVariableFromPayload(session: ChatbotSession, contact: Contact, variables: Record<string, any>, varName: string, payload: any): Promise<Record<string, any>> {
    if (!varName || payload === undefined || payload === null) return variables;
    
    const match = varName.match(/^\\{\\{(custom|var|contact)\\.(.+)\\}\\}\$/);
    if (match) {
      const [_, type, field] = match;
      if (type === 'custom') {
        const currentFields = ((contact as any).customFields as Record<string, any>) || {};
        await this.prisma.contact.update({ where: { id: contact.id }, data: { customFields: { ...currentFields, [field]: payload } } });
        variables = { ...variables, [\custom.\\]: payload };
      } else if (type === 'var') {
        variables = { ...variables, [\ar.\\]: payload };
      } else if (type === 'contact') {
        await this.prisma.contact.update({ where: { id: contact.id }, data: { [field]: payload } });
      }
    } else {
      const currentFields = ((contact as any).customFields as Record<string, any>) || {};
      await this.prisma.contact.update({ where: { id: contact.id }, data: { customFields: { ...currentFields, [varName]: payload } } });
      variables = { ...variables, [\custom.\\]: payload };
    }
    await this.prisma.chatbotSession.update({ where: { id: session.id }, data: { variables } });
    return variables;
  }
;

if (!code.includes('saveVariableFromPayload(')) {
  code = code.replace('// --- Variable Resolution', helperMethod + '\n  // --- Variable Resolution');
}

code = code.replace(/const fieldName = config\.saveToVar;\s+if \(fieldName\) \{\s+const currentFields =[\s\S]+?await this\.prisma\.chatbotSession\.update\([^)]+\);\s+\}/g,
  "const varName = config.variableName || config.saveToVar;\n        if (varName) {\n          variables = await this.saveVariableFromPayload(session, contact, variables, varName, userInput);\n        }"
);

fs.writeFileSync(path, code);
console.log('Done refactoring askText');
