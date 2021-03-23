export interface IFBOptions {
  binPath: string;
  host: 'localhost';
  port: number;
  user: 'SYSDBA';
  password: 'masterkey';
};

export interface IOptions {
  resetBackupDir: boolean;
  zipPath: string;
  fb3: IFBOptions;
  fb25: IFBOptions;
};

export interface IFiles {
  /** Только имя архивного файла. Без расширения! */
  [archiveFileName: string]: {
    rootDir: string;
    subDirs?: boolean;
    include: ({
      fileName: string;
      preProcess: {
        newExt: string;
        processor: 'fb25' | 'fb3';
      };
    } | string)[],
    exclude?: {
      fileName: string;
    }[]
  }
};