import { IFiles, IFTPOptions, IOptions } from "./types.ts";
import * as path from "https://deno.land/std/path/mod.ts";
import { dateToString } from "https://deno.land/x/date_format_deno/mod.ts"
import { ensureDir, existsSync, move } from "https://deno.land/std/fs/mod.ts";
import { ftpSender } from "./ftp.ts";
//import { readdirSync } from 'node.ts';

const log = (s: string) => {
  console.log(s);
  Deno.writeTextFileSync('./log.txt', s + '\n', { append: true });
};

/**
 * 
 * @param destDir Where directory with backup archives will be placed.
 * @param destPrefix Prefix for the name of directory with backup archives.
 * @param remoteDir If specified, the directory with backup archives will be moved there upon process completion.
 * @param files List of files/dirs to backup.
 * @param options Options of the backup.
 * @param ftpoptions ftp options
 */
export const backup = async (destDir: string, destPrefix: string, remoteDir: string | undefined, files: IFiles, options: IOptions, ftpoptions: IFTPOptions) => {

  const archiveDate = new Date();
  const { resetBackupDir, fb25, fb3, zipPath } = options;
  const maxProcessCount = options.maxProcessCount ?? 4;
  const uploadFtp = ftpoptions.upload ?? true;

  log(`${'='.repeat(80)}\narchivation started ${archiveDate.toLocaleDateString()} ${archiveDate.toLocaleTimeString()}\n`);

  const date2fn = (d: Date) => dateToString("yyyy-MM-dd", d);
  const getDestName = (d: Date) => path.join(destDir, destPrefix + '-' + date2fn(d));

  // при автоматическим формировании архива по расписанию целевой каталог
  // может переполниться. Предусмотрим опцию удаления последнего
  // архивного каталога. Будем смотреть только за последние 100 дней.
  if (resetBackupDir) {
    const d = new Date();
    let i = 100;

    while (i-- > 0) {
      const prevDest = getDestName(d);
      if (existsSync(prevDest)) {
        await Deno.remove(prevDest, { recursive: true });
        log(`previous archive dir ${prevDest} has been removed...`);
        break;
      }
      d.setDate(d.getDate() - 1);
    }
  }

  const datePart = date2fn(archiveDate);
  const destFullName = getDestName(archiveDate);

  await ensureDir(destFullName);

  const processes: Promise<void>[] = [];

  for (const [archiveFileName, archive] of Object.entries(files)) {

    if (processes.length >= maxProcessCount) {
      log(`waiting for ${processes.length} processes to finish...`);
      await Promise.all(processes);
      log(`${processes.length} processes have finished...`);
      processes.length = 0;
    }

    const processFunc = async () => {
      const { rootDir, subDirs, include } = archive;

      if (!existsSync(rootDir)) {
        log(`Error: ${rootDir} not found!`);
        return;
      }

      const fullArchiveFileName = path.join(destFullName, `${archiveFileName}.${datePart}.7z`);

      for (const f of include) {
        let fullFileName = path.join(rootDir, typeof f === 'string' ? f : f.fileName);
        let tempFile = false;

        if (!existsSync(fullFileName)) {
          log(`WARNING: file ${fullFileName} not found...`);
          continue;
        }

        if (typeof f !== 'string' && f.preProcess) {
          if (f.preProcess.processor === 'fb25' || f.preProcess.processor === 'fb3') {
            const { binPath, host, port, user, password } = f.preProcess.processor === 'fb25' ? fb25 : fb3;
            const { dir, name } = path.parse(fullFileName);
            const fullBKName = path.join(dir, name + '.' + f.preProcess.processor + f.preProcess.newExt);

            const gbak = Deno.run({
              cmd: [
                path.join(binPath, 'gbak'),
                '-b',
                fullFileName,
                fullBKName,
                '-user',
                user,
                '-password',
                password,
                '-g',
                '-se',
                `${host}/${port}:service_mgr`
              ],
              cwd: rootDir,
              stdin: 'piped',
              stdout: 'piped',
              stderr: 'piped'
            });

            const [status, stdout, stderr] = await Promise.all([
              gbak.status(),
              gbak.output(),
              gbak.stderrOutput()
            ]);

            log(new TextDecoder().decode(stdout));

            gbak.close();

            if (status.success) {
              log(`database backup ${fullBKName} has been created...`);
            } else {
              log(`error creating database backup...`);
              throw new Error(new TextDecoder().decode(stderr));
            }

            fullFileName = fullBKName;
            tempFile = true;
          } else {
            throw new Error(`Unknown processor ${f.preProcess.processor}`);
          }
        }

        const zip = Deno.run({
          cmd: [
            path.join(zipPath, '7z'),
            'u', '-y', subDirs ? '-r0' : '-r-', '-ssw', '-mmt2', '-mx5',
            '-xr!node_modules',
            fullArchiveFileName,
            fullFileName
          ],
          cwd: rootDir,
          stdin: 'piped',
          stdout: 'piped',
          stderr: 'piped'
        });

        const [status, stdout, stderr] = await Promise.all([
          zip.status(),
          zip.output(),
          zip.stderrOutput()
        ]);

        log(new TextDecoder().decode(stdout));

        zip.close();

        if (!status.success) {
          log(`error creating archive...`);
          log(new TextDecoder().decode(stderr));
        }

        if (tempFile && existsSync(fullFileName)) {
          await Deno.remove(fullFileName);
        }
      }
    }

    processes.push(processFunc());
  }

  await Promise.all(processes);

  if (remoteDir) {
    await move(destFullName, remoteDir + '/' + destPrefix + '-' + datePart, { overwrite: true });
    log(`${destFullName} has been moved to ${remoteDir}...`)
  }

  // тут нужен цикл по файлам архива после перемещения
  const destFolder = destDir + destPrefix + '-' + datePart; 
  //let fs = readdirSync(destFolder);
   // for (const ffile in  fs){
  //    // upload to ftp-server
  //   if (uploadFtp) {
  //     if (!existsSync(ffile)) {
  //       log(`file  ${ffile} does not exists`)
  //     } else {
  //       await ftpSender(ffile, ftpoptions);
  //       log(`file ${ffile} was transfered to ${ftpoptions.srvname}...`);
  //     } 
  //    }

  //}

  const finishDate = new Date();
  log(`archivation finished ${finishDate.toISOString()}, in ${new Date(finishDate.getDate() - archiveDate.getDate()).toISOString().slice(11, -1)}`);
}