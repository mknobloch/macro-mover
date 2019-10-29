import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, SfdxError, fs } from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('macro-mover', 'macro');

export default class Org extends SfdxCommand {

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
    // flag with a value (-n, --name=VALUE)
    macrofilename: flags.string({
      char: 'f',
      description: messages.getMessage('deploy.parameters.fileName')
    }),
  };

  protected static supportsUsername = true;
  protected static requiresProject = false;

  public async run(): Promise<AnyJson> {
    fs.readJson(this.flags.macrofilename)
      .then(result => {
        this.handleMacroJson(result.Macros);
      })
      .catch(error => {
        throw new SfdxError(messages.getMessage('deploy.errors.readingJson', ['./' + this.flags.macrofilename]));
      })
  }

  private async handleMacroJson(macroJson) {
    const conn = this.org.getConnection();

    interface Folder {
      Id: string;
      Name: string;
      DeveloperName: string;
    }

    let folderResult = await conn.query<Folder>(this.getFolderQuery(macroJson));
    this.ux.log('the folder result');
    this.ux.logJson(folderResult.records);

    let folderMap = this.getFolderMap(folderResult.records);
    this.ux.log('the map');
    this.ux.logJson(folderMap);

    var newFolders = [];
    macroJson.forEach(macro => {
      if(!folderMap.has(macro.Folder.DeveloperName)) {
        newFolders.push({
          Name: macro.Folder.Name,
          DeveloperName: macro.Folder.DeveloperName
        });
      }
    })

    this.ux.log('the new folders to create');
    this.ux.logJson(newFolders);

    let foldersToInsert = this.getInsertReadyFolders(newFolders);
    this.ux.log('folders to insert');
    this.ux.logJson(foldersToInsert);
    this.insertFolders(foldersToInsert)
      .then(folderInsertResult => {
        this.ux.log('folder insert result');
        this.ux.logJson(folderInsertResult);
      });


    // check macros to make sure all have folders
    // if no folder found in map create folder

    let macrosToInsert = this.getInsertReadyMacros(macroJson, folderMap);

    // let macroInsertResult = this.insertMacros(macrosToInsert);

    // w/ new ids, iterate over orig. JSON & build MacroInstruction json to insert
    // insert MacroInstructions

    // Return an object to be displayed with --json
    return { };
  }

  private getFolderQuery(macroJson) {
    let folderQuery = 'SELECT Id, DeveloperName, AccessType, IsReadonly, NamespacePrefix, Type ' +
                      'FROM Folder ' +
                      'WHERE DeveloperName IN (';

    macroJson.forEach(macro => {
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

  private getInsertReadyMacros(macroJson, folderMap) {
    var macrosToInsert = new Array();
    macroJson.forEach(macro => {
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

  private getInsertReadyMacroInstructions() {

  }

  private insertFolders(foldersToInsert) {
    let conn = this.org.getConnection();
    return conn.bulk.load("Folder", "insert", foldersToInsert, function(error, records) {
      if (error) {
        throw new SfdxError(messages.getMessage('deploy.errors.insertingFolders', [foldersToInsert, error]));
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
