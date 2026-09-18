let csrf='';
export async function api<T>(path:string,method='GET',body?:unknown,options:{key?:string,version?:number}={}):Promise<T>{
 if(method!=='GET') {const token=await fetch('/api/v1/auth/csrf',{credentials:'same-origin',cache:'no-store'});csrf=(await token.json()).token;}
 const headers:Record<string,string>={'Content-Type':'application/json'};
 if(method!=='GET')headers['X-CSRF-Token']=csrf;
 if(options.key)headers['Idempotency-Key']=options.key;
 if(options.version!==undefined)headers['If-Match']=String(options.version);
 const response=await fetch('/api/v1'+path,{method,credentials:'same-origin',headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
 const text=await response.text();let data:unknown;try{data=text?JSON.parse(text):{};}catch{data={code:'RESPOSTA_INVALIDA'};}
 if(!response.ok)throw new Error((data as {code?:string}).code||`HTTP ${response.status}`);
 return data as T;
}
export function key(){return crypto.randomUUID();}
export const friendly=(code:string)=>({INSUFFICIENT_CREDITS:'Saldo insuficiente para esta modalidade.',SOURCE_NOT_READY:'Aguarde a validação da fonte.',QUOTE_STALE:'A cotação expirou. Calcule novamente.',NO_SUITABLE_CLIPS:'Não encontramos trechos com qualidade suficiente neste vídeo. Seus créditos foram devolvidos.',MASTER_EXPIRED:'Os arquivos expiraram. Envie o vídeo novamente.',STEP_UP_REQUIRED_LOGIN_AGAIN:'Entre novamente com MFA para esta ação.',TIER_PRICE_PENDING_APPROVAL:'A faixa acima de 90 minutos ainda aguarda ativação do preço.',MFA_REQUIRED:'Informe o código do autenticador.',INVALID_SEGMENTS:'Revise os trechos da timeline. Eles não podem se sobrepor, inverter ou ultrapassar o vídeo.',INVALID_EDITOR_PRESET:'Esse preset não é aceito pelo editor.',INVALID_CROP:'Revise o crop. X, Y, largura e altura precisam ficar dentro do quadro.',NO_ANALYSIS_AVAILABLE:'Faça ao menos um processamento antes de criar cortes manuais.',INVALID_SUBTITLE:'Revise o texto ou o sincronismo das legendas.',SELECT_CLIP_FIRST:'Marque o corte como selecionado antes de exportar.',ADDITIONAL_FORMAT_QUOTE_REQUIRED:'Esse formato não fazia parte da cotação original.',PROJECT_BUSY:'Este projeto já está processando outra tarefa.',REVISION_NOT_FOUND:'Essa revisão não existe mais.',REVISION_ALREADY_CURRENT:'Essa já é a revisão atual.',INVALID_COVER_TIME:'Escolha um ponto válido dentro do vídeo para gerar a capa.',VERSION_CONFLICT:'O corte foi alterado em outra sessão. Atualize a página antes de continuar.'}[code]||code);
