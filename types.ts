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
  maxProcessCount?: number;
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

/* ftp connection*/
export interface IFTPConnection{
  mode: 'active' | 'passive' | undefined;
  user: string;
  pass: string;
};

/*ftp options*/
export interface IFTPOptions {
  srvname: string;
  upload : boolean,
  ConnectionOptions: IFTPConnection;
};