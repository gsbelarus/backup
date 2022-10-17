export interface IFBOptions {
  binPath: string;
  host: 'localhost';
  port: number;
  user: 'SYSDBA';
  password: 'masterkey';
};

export interface IFTPOptions {
  server: string;
  port?: number;
  mode?: 'active' | 'passive';
  dir?: string;
  user: string;
  pass: string;
  disabled?: boolean,
};

export interface IOptions {
  resetBackupDir: boolean;
  zipPath: string;
  fb3: IFBOptions;
  fb25: IFBOptions;
  maxProcessCount?: number;
  ftp?: IFTPOptions;
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

