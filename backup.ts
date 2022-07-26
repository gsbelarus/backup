import { IFiles, IOptions } from "./types.ts";
import * as path from "https://deno.land/std/path/mod.ts";
import { dateToString } from "https://deno.land/x/date_format_deno/mod.ts"
import { ensureDir, existsSync, move } from "https://deno.land/std/fs/mod.ts";

const log = (s: string) => {
  console.log(s);
  Deno.writeTextFileSync('./log.txt', s + '\n', { append: true });
};

export const backup = async (destDir: string, destPrefix: string, remoteDir: string | undefined, files: IFiles, options: IOptions) => {

  const archiveDate = new Date();
  const { resetBackupDir, fb25, fb3, zipPath } = options;
  const maxProcessCount = options.maxProcessCount ?? 4;

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

      const fullArchiveFileName = path.join(destFullName, `${archiveFileName}.${datePart}.7z`);

      for (const f of include) {
        let fullFileName = path.join(rootDir, typeof f === 'string' ? f : f.fileName);
        let tempFile = false;

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

  const finishDate = new Date();
  log(`archivation finished ${finishDate.toISOString()}, in ${new Date(finishDate.getDate() - archiveDate.getDate()).toISOString().slice(11, -1)}`);
};