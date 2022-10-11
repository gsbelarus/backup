import {FTPClient} from "https://deno.land/x/ftpc/mod.ts";
import {existsSync, move, copy } from "https://deno.land/std/fs/mod.ts";
// import {log} from "./backup.ts"
import {IFiles, IFTPOptions} from "./types.ts";

// param uplftp = true - upload files to ftpserver

export const ftpSender = async (fileName: string, ftpoptions: IFTPOptions) =>{

  const {srvname, upload, mode, user, pass} = ftpoptions;  
  
  if (!upload){
    return;
  }

  let client = new FTPClient(srvname, mode, user, pass);
  
  // создаем соединение с ftp
  await client.connect();
  // log(`\nConnect with ftp-server ${srvname} was created!`);
  
  // берем файл который будем заливать
  let file = await Deno.open(fileName, {
    read: true,
  });
  
  // создаем стрим
  let stream = await client.uploadStream(fileName);
  
  //копируем на ftp
  await Deno.copy(file, stream);

  // закрываем стрим, файл, соединение
  await client.finalizeStream();
  file.close();
  // log(`\nTransfer to ftp-server ${srvname} was completed!`);
  await client.close();
}