#!/usr/bin/env bash

mkdir -p ./temp
mkdir -p ./production

for f in ./types/*.ts
do 
    fn="${f##*/}" # file name with ext
    ff="${fn%.*}" # file name only

    for jsonfile in ./development/$ff*.json; do 
        echo "Validate $jsonfile in development/"
        if [[ ! -f "./temp/$ff.json" ]]; then
           echo "Generating schema..."
           npx typescript-json-schema ./types/$ff.ts --strictNullChecks Schema > ./temp/$ff.json
           echo "Generating schema... done"
        fi
        npx ajv validate -s ./temp/$ff.json -d $jsonfile > /dev/null
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

cp -a ./constants/. ./production/

rm ./temp/*.json
rmdir ./temp 
