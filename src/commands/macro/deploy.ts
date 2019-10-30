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

    let folderResult = await conn.query<Folder>(this.getFolderQueryForMacros(macroRecords));
    let folderMap = this.getFolderMap(folderResult.records);

    let newFolders = this.getNewFolders(macroRecords, folderMap);
    let foldersToInsert = this.getInsertReadyFolders(newFolders);

    if(foldersToInsert.length > 0) {
      await conn.bulk.load("Folder", "insert", foldersToInsert);
      let newFolderResult = await conn.query<Folder>(this.getFolderQueryForNewFolders(newFolders));
      this.addNewFoldersToFolderMap(newFolderResult.records, folderMap)
    }

    // check macros to make sure all have folders
    // if no folder found in map create folder

    let macrosToInsert = this.getInsertReadyMacros(macroRecords, folderMap);

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

    macros.forEach(macro => {
      folderQuery += '\'' + macro.Folder.DeveloperName + '\','
    });

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
        "DeveloperName": macro.DeveloperName,
        "StartingContext": macro.StartingContext
      });
    });
    return macrosToInsert;
  }

  private getInsertReadyMacroInstructions() {

  }

  private insertMacros(macrosToInsert) {
    let conn = this.org.getConnection();

    conn.bulk.load("Macro", "insert", macrosToInsert, function(error, records) {
      if (error) {
        console.log(error);
      } 

      for (var i=0; i < records.length; i++) {
        if (records[i].success) {
          console.log("#" + (i+1) + " loaded successfully, id = " + records[i].id);
        } else {
          console.log("#" + (i+1) + " error occurred, message = " + records[i].errors.join(', '));
        }
      }

      return records;
    })
  }

  private insertMacroInstructions() {

  }
}
