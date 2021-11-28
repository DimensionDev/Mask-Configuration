#!/usr/bin/env bash

mkdir -p ./temp
mkdir -p ./production

for f in ./types/*.ts
do 
    fn="${f##*/}" # file name with ext
    ff="${fn%.*}" # file name only

    for jsonfile in ./development/$ff*.json; do 
        echo "Validate $jsonfile in development/"
        npx typescript-json-schema ./types/$ff.ts Schema > ./temp/schema.json
        npx ajv validate -s ./temp/schema.json -d $jsonfile > /dev/null
    done

    for jsonfile in ./development/$ff*.json; do
        echo "Depoly $jsonfile to production/"
        name="${jsonfile##*/}"
        cp $jsonfile ./production/$name
    done

    for jsonfile in ./production/$ff*.json; do
        echo "Compress $jsonfile in production/"
        npx json-minify $jsonfile > ./temp/compressed.json
        mv ./temp/compressed.json $jsonfile
    done
done

rm ./temp/schema.json
rmdir ./temp 