export function solverStatus(status:string):string{const labels:Record<string,string>={idle:"Ready",running:"Analyzing",complete:"Complete",cancelled:"Cancelled",error:"Unable to analyze"};return labels[status]??"Analysis";}
export function techniqueText(version:string):string{return version.replace(/@\d+$/," ").replace(/[-_]/g," ").replace(/^./,value=>value.toUpperCase()).trim();}
