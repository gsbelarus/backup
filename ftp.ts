import {FTPClient} from "https://deno.land/x/ftpc/mod.ts";
import {existsSync, move, copy } from "https://deno.land/std/fs/mod.ts";
//import {log} from "./backup.ts"
import {IFiles, IFTPOptions} from "./types.ts";

 export const ftpSender = async (tfile: string, ftpoptions: IFTPOptions) =>{
   const {srvname, upload, ConnectionOptions} = ftpoptions; 
   if (!upload){
    return;
   }
    
 // const tfile = "./test.txt";  
  const client = new FTPClient(srvname, ConnectionOptions);

  // создаем соединение с ftp
  await client.connect();
  //  log(`\nConnect with ftp-server ${srvname} was created!`);
  
  // берем файл который будем заливать
  const file = await Deno.open(tfile, {
    read: true,
  });
  
  // создаем стрим
  const stream = await client.uploadStream(tfile);
  
  //копируем на ftp
  await Deno.copy(file, stream);

  // закрываем стрим, файл, соединение
  await client.finalizeStream();
  file.close();
  //  log(`\nTransfer to ftp-server ${srvname} was completed!`);
  await client.close();
}