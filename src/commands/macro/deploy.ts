import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, SfdxError, fs } from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('macro-mover', 'macro');

export default class MacroDeploy extends SfdxCommand {

  public static description = messages.getMessage('deploy.description');

  public static examples = [
  `$ sfdx hello:org --targetusername myOrg@example.com --targetdevhubusername devhub@org.com
  Hello world! This is org: MyOrg and I will be around until Tue Mar 20 2018!
  My hub org id is: 00Dxx000000001234
  `,
  `$ sfdx hello:org --name myname --targetusername myOrg@example.com
  Hello myname! This is org: MyOrg and I will be around until Tue Mar 20 2018!
  `
  ];

  public static args = [{name: 'file'}];

  protected static flagsConfig = {
    macrofilename: flags.string({
      char: 'f',
      description: messages.getMessage('deploy.parameters.fileName')
    }),
  };

  protected static supportsUsername = true;
  protected static requiresProject = false;

  public async run(): Promise<AnyJson> {
    let macroJson = await this.readMacroJson();
    let macroRecords = macroJson.Macros;

    const conn = this.org.getConnection();

    interface Folder {
      Id: string;
      Name: string;
      DeveloperName: string;
    }

    // Folder Map section --> can be broken out at the end
    this.ux.log('\n==================== FOLDERS ====================')
    this.ux.log('\nChecking for folders in the target environments');
    let folderResult = await conn.query<Folder>(this.getFolderQueryForMacros(macroRecords));
    this.ux.log('\n' + folderResult.records.length + ' folder(s) found in the target environment.');
    let folderMap = this.getFolderMap(folderResult.records);

    let newFolders = this.getNewFolders(macroRecords, folderMap);
    let foldersToInsert = this.getInsertReadyFolders(newFolders);
    this.ux.log('\n' + newFolders.length + ' new folder(s) need to be created.');

    if(foldersToInsert.length > 0) {
      this.ux.log('\n' + 'Inserting ' + foldersToInsert.length + ' new folder(s) not in the target environment.');
      let folderInsertResult = await conn.bulk.load("Folder", "insert", foldersToInsert);
      this.ux.log('\n' + this.getSuccessfulRecordCount(folderInsertResult) + ' folder(s) successfully inserted.');
      let newFolderResult = await conn.query<Folder>(this.getFolderQueryForNewFolders(newFolders));
      this.addNewFoldersToFolderMap(newFolderResult.records, folderMap)
    }
    // End Folder Map section

    // check macros to make sure all have folders
    // if no folder found in map create folder

    this.ux.log('\n==================== MACROS ====================')
    let macrosToInsert = this.getInsertReadyMacros(macroRecords, folderMap);
    if(macrosToInsert.length > 0) {
      this.ux.log('\nInserting ' + macrosToInsert.length + ' macro(s).')
      let macroInsertResult = await conn.bulk.load("Macro", "insert", macrosToInsert);
      this.ux.log('\n' + this.getSuccessfulRecordCount(macroInsertResult) + ' macro(s) inserted successfully.');
    }

    // let macroInsertResult = this.insertMacros(macrosToInsert);

    // w/ new ids, iterate over orig. JSON & build MacroInstruction json to insert
    // insert MacroInstructions

    // Return an object to be displayed with --json
    return { };
  }

  private async readMacroJson() {
    try {
      let macroJson = await fs.readJson(this.flags.macrofilename);
      return macroJson
    } catch (error) {
      throw new SfdxError(messages.getMessage('deploy.errors.readingJson', ['./' + this.flags.macrofilename]));
    }
  }

  private getFolderQueryForMacros(macros) {
    let folderQuery = 'SELECT Id, DeveloperName, AccessType, IsReadonly, NamespacePrefix, Type ' +
                      'FROM Folder ' +
                      'WHERE DeveloperName IN (';

    let folderSet = new Set<String>();

    macros.forEach(macro => {
      folderQuery += '\'' + macro.Folder.DeveloperName + '\','
      folderSet.add(macro.Folder.DeveloperName);
    });

    this.ux.log('\n' + folderSet.size + ' parent folder(s) found in the macro file.')

    return folderQuery.substring(0, folderQuery.length - 1) + ')';
  }

  private getFolderMap(folderRecords) {
    let folderMap = new Map<String, String>();
    folderRecords.forEach(record => {
      folderMap.set(record.DeveloperName, record.Id);
    })
    return folderMap;
  }

  private getNewFolders(macros, folderMap) {
    var newFolders = [];
    macros.forEach(macro => {
      if(!folderMap.has(macro.Folder.DeveloperName)) {
        newFolders.push({
          Name: macro.Folder.Name,
          DeveloperName: macro.Folder.DeveloperName
        });
      }
    })
    return newFolders;
  }

  private getInsertReadyFolders(newFolders) {
    var foldersToInsert = [];
    newFolders.forEach(newFolder => {
      foldersToInsert.push({
        Name: newFolder.Name,
        DeveloperName: newFolder.DeveloperName,
        AccessType: "Hidden",
        IsReadonly: "True",
        Type: "Macro"
      })
    })
    return foldersToInsert;
  }

  private getFolderQueryForNewFolders(newFolders) {
    let folderQuery = 'SELECT Id, DeveloperName ' +
                      'FROM Folder ' +
                      'WHERE DeveloperName IN (';

    newFolders.forEach(newFolder => {
      folderQuery += '\'' + newFolder.DeveloperName + '\','
    });

    return folderQuery.substring(0, folderQuery.length - 1) + ')';
  }

  private addNewFoldersToFolderMap(newFolders, folderMap) {
    newFolders.forEach(newFolder => {
      folderMap.set(newFolder.DeveloperName, newFolder.Id);
    }) 
  }

  private getInsertReadyMacros(macroRecords, folderMap) {
    var macrosToInsert = new Array();
    macroRecords.forEach(macro => {
      macrosToInsert.push({
        "Description": macro.Description,
        "FolderId": folderMap.get(macro.Folder.DeveloperName),
        "IsAlohaSupported": macro.IsAlohaSupported,
        "IsLightningSupported": macro.IsLightningSupported,
        "Name": macro.Name,
        "StartingContext": macro.StartingContext
      });
    });
    return macrosToInsert;
  }

  private getSuccessfulRecordCount(insertResult) {
    let successfulInserts = 0;
    insertResult.forEach(insert => {
        if(insert.success) {
          successfulInserts++;
        }
      })
      return successfulInserts;
  }

  private getInsertReadyMacroInstructions() {

  }

  private insertMacroInstructions() {

  }
}
