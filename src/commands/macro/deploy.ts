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
    let results = {};

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
    let folderMap = this.getIdByFieldMap(folderResult.records, 'DeveloperName');

    let newFolders = this.getNewFolders(macroRecords, folderMap);
    let foldersToInsert = this.getInsertReadyFolders(newFolders);
    this.ux.log('\n' + newFolders.length + ' new folder(s) need to be created.');

    if(foldersToInsert.length > 0) {
      results['attemptedFolderInserts'] = foldersToInsert.length;
      this.ux.log('\n' + 'Inserting ' + foldersToInsert.length + ' new folder(s) not in the target environment.');
      let folderInsertResult = await conn.bulk.load("Folder", "insert", foldersToInsert);
      results['successfulFolderInserts'] = folderInsertResult.length;
      this.ux.log('\n' + this.getSuccessfulRecordCount(folderInsertResult) + ' folder(s) successfully inserted.');
      let newFolderResult = await conn.query<Folder>(this.getIdAndFieldQueryById(newFolders, 'DeveloperName', 'Folder', 'DeveloperName'));
      this.addNewFoldersToFolderMap(newFolderResult.records, folderMap);
    }

    interface Macro {
      Id: string;
      Name: string;
      DeveloperName: string;
    }

    this.ux.log('\n==================== MACROS ====================')
    let macrosToInsert = this.getInsertReadyMacros(macroRecords, folderMap);
    if(macrosToInsert.length > 0) {
      results['attemptedMacroInserts'] = macrosToInsert.length;
      this.ux.log('\nInserting ' + macrosToInsert.length + ' macro(s).')
      let macroInsertResult = await conn.bulk.load("Macro", "insert", macrosToInsert);
      results['successfulMacroInserts'] = macroInsertResult.length;
      this.ux.log('\n' + this.getSuccessfulRecordCount(macroInsertResult) + ' macro(s) inserted successfully.');

      let macroQueryResult = await conn.query<Macro>(this.getIdAndFieldQueryById(macroInsertResult, 'Name', 'Macro', 'id'));
      let macroMap = this.getIdByFieldMap(macroQueryResult.records, 'Name');

      this.ux.log('\n==================== MACRO INSTRUCTIONS ====================')
      let macroInstructionsToInsert = this.getInsertReadyMacroInstructions(macroRecords, macroMap);
      if(macroInstructionsToInsert.length > 0) {
        results['attemptedMacroInstructionInserts'] = macroInstructionsToInsert.length;
        this.ux.log('\nInserting ' + macroInstructionsToInsert.length + ' macro instruction(s).')
        let macroInstructionInsertResult = await conn.bulk.load("MacroInstruction", "insert", macroInstructionsToInsert);
        results['successfulMacroInstructionInserts'] = macroInstructionInsertResult.length;
        this.ux.log('\n' + this.getSuccessfulRecordCount(macroInstructionInsertResult) + ' macro instruction(s) inserted successfully.');
      }
    }

    this.ux.log('\n==================== DEPLOY RESULTS ====================')
    this.ux.logJson(results);
    return results;
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

  private getIdByFieldMap(records, fieldApiName) {
    let developerNameByIdMap = new Map<String, String>();
    records.forEach(record => {
      developerNameByIdMap.set(record[fieldApiName], record.Id);
    })
    return developerNameByIdMap;
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

  private addNewFoldersToFolderMap(newFolders, folderMap) {
    newFolders.forEach(newFolder => {
      folderMap.set(newFolder.DeveloperName, newFolder.Id);
    })
  }

  private getInsertReadyMacros(macros, folderMap) {
    var macrosToInsert = new Array();
    macros.forEach(macro => {
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

  private getInsertReadyMacroInstructions(macros, macroMap) {
    let macroInstructionsToInsert = new Array();
    macros.forEach(macro => {
      macro.MacroInstructions.forEach(macroInstruction => {
        macroInstructionsToInsert.push({
          "MacroId": macroMap.get(macro.Name),
          "Operation": macroInstruction.Operation,
          "SortOrder": macroInstruction.SortOrder,
          "Target": macroInstruction.Target,
          "Value": macroInstruction.Value,
          "ValueRecord": macroInstruction.ValueRecord
        });
      }, this)
    }, this)
    return macroInstructionsToInsert;
  }

  // this method is awful and needs to be refactored/simplified...
  private getIdAndFieldQueryById(insertResult, fields, sObjectType, whereField) {
    let query = 'SELECT Id, ' + fields + ' ' + 
                'FROM ' + sObjectType + ' ' +
                'WHERE ' + whereField + ' IN (';

    insertResult.forEach(insert => {
      query += '\'' + insert[whereField] + '\','
    })

    return query.substring(0, query.length - 1) + ')';
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
}