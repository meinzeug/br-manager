import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(input:Buffer):string{
  let bits=0,value=0,output="";
  for(const byte of input){value=(value<<8)|byte;bits+=8;while(bits>=5){output+=alphabet[(value>>>(bits-5))&31];bits-=5;}}
  if(bits>0)output+=alphabet[(value<<(5-bits))&31];
  return output;
}

function base32Decode(input:string):Buffer{
  let bits=0,value=0;const output:number[]=[];
  for(const char of input.toUpperCase().replace(/[^A-Z2-7]/g,"")){const index=alphabet.indexOf(char);if(index<0)continue;value=(value<<5)|index;bits+=5;if(bits>=8){output.push((value>>>(bits-8))&255);bits-=8;}}
  return Buffer.from(output);
}

export function generateTotpSecret():string{return base32Encode(randomBytes(20));}

export function totp(secret:string,time=Date.now()):string{
  const counter=BigInt(Math.floor(time/30_000)),buffer=Buffer.alloc(8);buffer.writeBigUInt64BE(counter);
  const hash=createHmac("sha1",base32Decode(secret)).update(buffer).digest(),offset=hash[hash.length-1]!&15;
  const number=(hash.readUInt32BE(offset)&0x7fffffff)%1_000_000;
  return String(number).padStart(6,"0");
}

export function verifyTotp(secret:string,code:string):boolean{
  const normalized=code.replace(/\s/g,"");
  if(!/^\d{6}$/.test(normalized))return false;
  for(const window of [-1,0,1]){const expected=totp(secret,Date.now()+window*30_000),left=Buffer.from(expected),right=Buffer.from(normalized);if(left.length===right.length&&timingSafeEqual(left,right))return true;}
  return false;
}
