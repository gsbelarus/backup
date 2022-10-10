import {FTPClient} from "https://deno.land/x/ftpc/mod.ts";
import {existsSync, move, copy } from "https://deno.land/std/fs/mod.ts";
import {log} from "./backup.ts"
import {IFTPOptions} from "./types.ts";

// param uplftp = true - upload files to ftpserver

export const ftpSender = async (uplftp: boolean, ftpoptions: IFTPOptions) =>{
  if (!uplftp) {
    return;
  }
     
  const {srvname, mode, user, pass} = ftpoptions;  
  
  let client = new FTPClient(srvname, {mode, user, pass});
  
  // создаем соединение с ftp
  await client.connect();
  log(`\nConnect with ftp-server ${srvname} was created!`);
  
  // берем файл который будем заливать
  let file = await Deno.open("test.txt", {
    read: true,
  });
  
  // создаем стрим
  let stream = await client.uploadStream("5MB.txt");
  
  //копируем на ftp
  await Deno.copy(file, stream);

  // закрываем стрим, файл, соединение
  await client.finalizeStream();
  file.close();
  log(`\nTransfer to ftp-server ${srvname} was completed!`);
  await client.close();
}