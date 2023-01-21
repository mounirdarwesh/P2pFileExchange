const path = require('node:path')
const fs = require('fs')

//* Helper function to read the contents of a Folder and the sort the files
//* after the second part of the name and the after the timestamp
function readAndSortFolder (folderPath) {
  const files = fs.readdirSync(folderPath)

  //* store file Properties
  const fileObjs = []

  if (files.length !== 0) {
    for (const file of files) {
      const filePath = path.join(folderPath, file)
      const stats = fs.statSync(filePath)
      fileObjs.push({
        name: file,
        path: filePath,
        mtime: stats.mtime
      })
    }

    //* sort the files after the second part of the name and the after the timestamp
    fileObjs.sort((a, b) => {
      return Number(a.name.split('_').at(1)) - Number(b.name.split('_').at(1)) || a.mtime - b.mtime
    })
  }
  return fileObjs
}
module.exports = readAndSortFolder
