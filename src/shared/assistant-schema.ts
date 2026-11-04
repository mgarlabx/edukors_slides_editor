const string={type:'string'};
const slideFields=Object.fromEntries(['title','layoutId','html','css','script','staticHtml','notes'].map(k=>[k,string]));
export const applySchema={type:'object',additionalProperties:false,properties:{
  message:{type:'string',description:'Optional short summary of the change for the user.'},
  systemPrompt:{type:'string',maxLength:20000},
  slideUpdates:{type:'array',maxItems:300,items:{type:'object',additionalProperties:false,properties:{id:string,...slideFields},required:['id']}},
  slideOrder:{type:'array',minItems:1,maxItems:300,items:string},
  masterUpdates:{type:'array',maxItems:20,items:{type:'object',additionalProperties:false,properties:{id:{type:'string',pattern:'^[\\w-]+$'},name:string,css:string,html:string},required:['id']}},
  activeMaster:string,
  layoutUpdates:{type:'array',maxItems:100,items:{type:'object',additionalProperties:false,properties:{id:{type:'string',pattern:'^[\\w-]+$'},name:string,html:string,css:string},required:['id']}},
  assets:{type:'array',maxItems:200,items:{type:'object',additionalProperties:false,properties:{id:{type:'string',pattern:'^asset-[\\w-]+$'},path:string,name:string},required:['id','path']}}}};

