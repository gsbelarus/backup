import { IFiles, IOptions } from "./types.ts";
import * as path from "jsr:@std/path";
import { dateToString } from "https://deno.land/x/date_format_deno/mod.ts";
import { FTPClient } from "https://deno.land/x/ftpc/mod.ts";
import { ensureDir, existsSync, move } from "jsr:@std/fs";

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
 */
export const backup = async (destDir: string, destPrefix: string, remoteDir: string | undefined, files: IFiles, options: IOptions) => {

  const archiveDate = new Date();
  const { resetBackupDir, fb25, fb3, zipPath } = options;
  const maxProcessCount = options.maxProcessCount ?? 4;

  log(`${'='.repeat(80)}\narchivation started ${archiveDate.toLocaleDateString()} ${archiveDate.toLocaleTimeString()}\n`);

  const date2fn = (d: Date) => dateToString("yyyy-MM-dd", d);
  const getDestName = (root: string, d: Date) => {
    const n = destPrefix + '-' + date2fn(d);
    return root ? path.join(root, n) : n;
  };

  // при автоматическим формировании архива по расписанию целевой каталог
  // может переполниться. Предусмотрим опцию удаления последнего
  // архивного каталога. Будем смотреть только за последние 100 дней.
  if (resetBackupDir) {
    const d = new Date();
    let i = 100;

    while (i-- > 0) {
      const prevDest = getDestName(destDir, d);
      try {
        await Deno.remove(prevDest, { recursive: true });
        log(`previous archive dir ${prevDest} has been removed...`);
        break;
      } catch (_) {
        // ignore
      }
      d.setDate(d.getDate() - 1);
    }
  }

  const datePart = date2fn(archiveDate);
  const destFullName = getDestName(destDir, archiveDate);

  await ensureDir(destFullName);

  const processes: Promise<void>[] = [];
  const archiveFiles: {
    fullFileName: string;
    fileName: string;
  }[] = [];

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

      const fileName = `${archiveFileName}.${datePart}.7z`;
      const fullArchiveFileName = path.join(destFullName, fileName);
      archiveFiles.push({ fullFileName: fullArchiveFileName, fileName });

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

            const gbak = new Deno.Command(
              path.join(binPath, 'gbak'),
              {
                args: [

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
              }).spawn();

            const { code, stdout, stderr } = await gbak.output();

            log(new TextDecoder().decode(stdout));

            if (code === 0) {
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

        const zip = new Deno.Command(
          path.join(zipPath, '7z'),
          {
            args: [
              'u', '-y', subDirs ? '-r0' : '-r-', '-ssw', '-mmt2', '-mx5',
              '-xr!node_modules',
              fullArchiveFileName,
              fullFileName
            ],
            cwd: rootDir,
            stdin: 'piped',
            stdout: 'piped',
            stderr: 'piped'
          }).spawn();

        const { code, stdout, stderr } = await zip.output();

        log(new TextDecoder().decode(stdout));

        if (code !== 0) {
          log(`error creating archive...`);
          log(new TextDecoder().decode(stderr));
        }

        if (tempFile) {
          try {
            Deno.removeSync(fullFileName);
          } catch (e) {
            log(`${e}`);
          }
        }
      }
    };

    processes.push(processFunc());
  }

  await Promise.all(processes);

  if (options.ftp && !options.ftp.disabled) {
    const { server, user, pass, mode, port, dir } = options.ftp;

    try {
      const ftpClient = new FTPClient(server, {
        user,
        pass,
        mode: mode ?? 'passive',
        port: port ?? 21,
      });

      await ftpClient.connect();
      log(`FTP connected to ${server}...`);

      if (dir) {
        await ftpClient.chdir(dir);
      }

      if (resetBackupDir) {
        const d = new Date();
        let i = 100;

        while (i-- > 0) {
          const prevDest = getDestName('', d);

          try {
            try {
              await ftpClient.chdir(prevDest);
            }
            catch (_) {
              continue;
            }

            log(`directory ${prevDest} found...`);
            const flist = await ftpClient.list('.');
            for (const fname of flist) {
              const stat = await ftpClient.stat(fname);
              if (stat.isFile) {
                await ftpClient.rm(fname);
                log(`archive ${fname} has been removed...`);
              }
            }
            await ftpClient.cdup();
            await ftpClient.rmdir(prevDest);
            log(`previous archive dir ${prevDest} has been removed...`);
            break;
          } catch (e) {
            log(`FTP error: ${(e as Error).message}`);
          }

          d.setDate(d.getDate() - 1);
        }
      }

      const ftpDestDir = getDestName('', archiveDate);

      if (dir) {
        await ftpClient.chdir(dir);
      }

      if (await ftpClient.mkdir(ftpDestDir)) {
        log(`directory ${ftpDestDir} has been created...`);
      }

      await ftpClient.close();

      for (const { fullFileName, fileName } of archiveFiles) {
        using ftpClient = new FTPClient(server, {
          user,
          pass,
          mode: mode ?? 'passive',
          port: port ?? 21,
        });

        await ftpClient.connect();

        if (dir) {
          await ftpClient.chdir(dir);
        }

        await ftpClient.chdir(ftpDestDir);

        const stat = await Deno.stat(fullFileName);
        using file = await Deno.open(fullFileName, { read: true });
        log(`starting uploading ${fileName}, bytes: ${stat.size}...`);
        await using stream = await ftpClient.uploadWritable(fileName, stat.size);
        log(`uploading ${fileName}, bytes: ${stat.size}...`);
        await file.readable.pipeTo(stream);
        log(`done! bytes: ${stat.size}...`);
      }
    } catch (e) {
      log(`FTP error: ${(e as Error).message}`);
    }
  }

  if (remoteDir) {
    await move(destFullName, remoteDir + '/' + destPrefix + '-' + datePart, { overwrite: true });
    log(`${destFullName} has been moved to ${remoteDir}...`);
  }

  const finishDate = new Date();
  log(`archivation finished ${finishDate.toISOString()}, in ${new Date(finishDate.getTime() - archiveDate.getTime()).toISOString().slice(11, -1)}`);
};
