/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 0 : 0;
        var yOffset = options.yaxis.mode === "time" ? 0 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 9.0, "minX": 0.0, "maxY": 6692.0, "series": [{"data": [[0.0, 9.0], [0.1, 17.0], [0.2, 19.0], [0.3, 21.0], [0.4, 23.0], [0.5, 25.0], [0.6, 27.0], [0.7, 28.0], [0.8, 30.0], [0.9, 32.0], [1.0, 33.0], [1.1, 35.0], [1.2, 37.0], [1.3, 38.0], [1.4, 40.0], [1.5, 42.0], [1.6, 44.0], [1.7, 45.0], [1.8, 47.0], [1.9, 48.0], [2.0, 50.0], [2.1, 52.0], [2.2, 53.0], [2.3, 55.0], [2.4, 56.0], [2.5, 58.0], [2.6, 60.0], [2.7, 61.0], [2.8, 63.0], [2.9, 64.0], [3.0, 66.0], [3.1, 67.0], [3.2, 69.0], [3.3, 70.0], [3.4, 72.0], [3.5, 74.0], [3.6, 75.0], [3.7, 77.0], [3.8, 78.0], [3.9, 80.0], [4.0, 81.0], [4.1, 82.0], [4.2, 84.0], [4.3, 85.0], [4.4, 87.0], [4.5, 88.0], [4.6, 89.0], [4.7, 91.0], [4.8, 92.0], [4.9, 94.0], [5.0, 95.0], [5.1, 97.0], [5.2, 98.0], [5.3, 99.0], [5.4, 101.0], [5.5, 102.0], [5.6, 103.0], [5.7, 105.0], [5.8, 106.0], [5.9, 107.0], [6.0, 109.0], [6.1, 110.0], [6.2, 112.0], [6.3, 113.0], [6.4, 114.0], [6.5, 115.0], [6.6, 117.0], [6.7, 118.0], [6.8, 119.0], [6.9, 120.0], [7.0, 122.0], [7.1, 123.0], [7.2, 125.0], [7.3, 126.0], [7.4, 128.0], [7.5, 129.0], [7.6, 130.0], [7.7, 131.0], [7.8, 133.0], [7.9, 134.0], [8.0, 135.0], [8.1, 136.0], [8.2, 138.0], [8.3, 139.0], [8.4, 140.0], [8.5, 141.0], [8.6, 143.0], [8.7, 144.0], [8.8, 145.0], [8.9, 147.0], [9.0, 148.0], [9.1, 149.0], [9.2, 150.0], [9.3, 151.0], [9.4, 152.0], [9.5, 154.0], [9.6, 155.0], [9.7, 156.0], [9.8, 157.0], [9.9, 159.0], [10.0, 160.0], [10.1, 161.0], [10.2, 163.0], [10.3, 164.0], [10.4, 165.0], [10.5, 166.0], [10.6, 168.0], [10.7, 169.0], [10.8, 170.0], [10.9, 171.0], [11.0, 172.0], [11.1, 173.0], [11.2, 175.0], [11.3, 176.0], [11.4, 177.0], [11.5, 178.0], [11.6, 180.0], [11.7, 181.0], [11.8, 182.0], [11.9, 183.0], [12.0, 185.0], [12.1, 186.0], [12.2, 187.0], [12.3, 189.0], [12.4, 190.0], [12.5, 191.0], [12.6, 192.0], [12.7, 193.0], [12.8, 194.0], [12.9, 196.0], [13.0, 197.0], [13.1, 198.0], [13.2, 199.0], [13.3, 200.0], [13.4, 202.0], [13.5, 203.0], [13.6, 204.0], [13.7, 206.0], [13.8, 207.0], [13.9, 208.0], [14.0, 210.0], [14.1, 211.0], [14.2, 212.0], [14.3, 213.0], [14.4, 215.0], [14.5, 216.0], [14.6, 217.0], [14.7, 219.0], [14.8, 220.0], [14.9, 221.0], [15.0, 223.0], [15.1, 224.0], [15.2, 226.0], [15.3, 227.0], [15.4, 228.0], [15.5, 229.0], [15.6, 231.0], [15.7, 232.0], [15.8, 233.0], [15.9, 234.0], [16.0, 236.0], [16.1, 238.0], [16.2, 239.0], [16.3, 240.0], [16.4, 242.0], [16.5, 244.0], [16.6, 245.0], [16.7, 246.0], [16.8, 248.0], [16.9, 249.0], [17.0, 251.0], [17.1, 253.0], [17.2, 254.0], [17.3, 255.0], [17.4, 257.0], [17.5, 258.0], [17.6, 260.0], [17.7, 261.0], [17.8, 263.0], [17.9, 265.0], [18.0, 267.0], [18.1, 268.0], [18.2, 270.0], [18.3, 271.0], [18.4, 273.0], [18.5, 274.0], [18.6, 276.0], [18.7, 278.0], [18.8, 279.0], [18.9, 281.0], [19.0, 283.0], [19.1, 285.0], [19.2, 286.0], [19.3, 288.0], [19.4, 289.0], [19.5, 291.0], [19.6, 293.0], [19.7, 294.0], [19.8, 296.0], [19.9, 298.0], [20.0, 300.0], [20.1, 302.0], [20.2, 304.0], [20.3, 305.0], [20.4, 307.0], [20.5, 309.0], [20.6, 310.0], [20.7, 312.0], [20.8, 314.0], [20.9, 315.0], [21.0, 317.0], [21.1, 319.0], [21.2, 320.0], [21.3, 322.0], [21.4, 324.0], [21.5, 326.0], [21.6, 328.0], [21.7, 329.0], [21.8, 331.0], [21.9, 333.0], [22.0, 335.0], [22.1, 336.0], [22.2, 339.0], [22.3, 340.0], [22.4, 342.0], [22.5, 344.0], [22.6, 346.0], [22.7, 348.0], [22.8, 349.0], [22.9, 351.0], [23.0, 353.0], [23.1, 355.0], [23.2, 357.0], [23.3, 359.0], [23.4, 361.0], [23.5, 363.0], [23.6, 364.0], [23.7, 366.0], [23.8, 368.0], [23.9, 370.0], [24.0, 371.0], [24.1, 373.0], [24.2, 375.0], [24.3, 377.0], [24.4, 379.0], [24.5, 381.0], [24.6, 383.0], [24.7, 384.0], [24.8, 386.0], [24.9, 388.0], [25.0, 390.0], [25.1, 392.0], [25.2, 394.0], [25.3, 396.0], [25.4, 397.0], [25.5, 400.0], [25.6, 401.0], [25.7, 403.0], [25.8, 405.0], [25.9, 406.0], [26.0, 408.0], [26.1, 410.0], [26.2, 412.0], [26.3, 414.0], [26.4, 416.0], [26.5, 418.0], [26.6, 420.0], [26.7, 422.0], [26.8, 424.0], [26.9, 426.0], [27.0, 428.0], [27.1, 430.0], [27.2, 432.0], [27.3, 434.0], [27.4, 436.0], [27.5, 438.0], [27.6, 440.0], [27.7, 442.0], [27.8, 444.0], [27.9, 446.0], [28.0, 448.0], [28.1, 450.0], [28.2, 452.0], [28.3, 454.0], [28.4, 456.0], [28.5, 458.0], [28.6, 460.0], [28.7, 462.0], [28.8, 464.0], [28.9, 466.0], [29.0, 468.0], [29.1, 470.0], [29.2, 472.0], [29.3, 474.0], [29.4, 476.0], [29.5, 479.0], [29.6, 481.0], [29.7, 483.0], [29.8, 485.0], [29.9, 487.0], [30.0, 489.0], [30.1, 491.0], [30.2, 493.0], [30.3, 495.0], [30.4, 497.0], [30.5, 499.0], [30.6, 502.0], [30.7, 504.0], [30.8, 506.0], [30.9, 508.0], [31.0, 510.0], [31.1, 512.0], [31.2, 514.0], [31.3, 516.0], [31.4, 519.0], [31.5, 521.0], [31.6, 523.0], [31.7, 525.0], [31.8, 527.0], [31.9, 529.0], [32.0, 531.0], [32.1, 533.0], [32.2, 535.0], [32.3, 537.0], [32.4, 539.0], [32.5, 541.0], [32.6, 543.0], [32.7, 545.0], [32.8, 547.0], [32.9, 549.0], [33.0, 551.0], [33.1, 553.0], [33.2, 555.0], [33.3, 558.0], [33.4, 560.0], [33.5, 563.0], [33.6, 564.0], [33.7, 567.0], [33.8, 569.0], [33.9, 571.0], [34.0, 573.0], [34.1, 575.0], [34.2, 578.0], [34.3, 580.0], [34.4, 582.0], [34.5, 584.0], [34.6, 587.0], [34.7, 589.0], [34.8, 591.0], [34.9, 593.0], [35.0, 595.0], [35.1, 597.0], [35.2, 599.0], [35.3, 602.0], [35.4, 604.0], [35.5, 606.0], [35.6, 608.0], [35.7, 610.0], [35.8, 612.0], [35.9, 614.0], [36.0, 616.0], [36.1, 618.0], [36.2, 620.0], [36.3, 622.0], [36.4, 624.0], [36.5, 626.0], [36.6, 628.0], [36.7, 630.0], [36.8, 632.0], [36.9, 635.0], [37.0, 637.0], [37.1, 639.0], [37.2, 640.0], [37.3, 642.0], [37.4, 644.0], [37.5, 646.0], [37.6, 648.0], [37.7, 650.0], [37.8, 652.0], [37.9, 654.0], [38.0, 656.0], [38.1, 658.0], [38.2, 660.0], [38.3, 662.0], [38.4, 664.0], [38.5, 666.0], [38.6, 668.0], [38.7, 670.0], [38.8, 672.0], [38.9, 674.0], [39.0, 676.0], [39.1, 678.0], [39.2, 680.0], [39.3, 682.0], [39.4, 683.0], [39.5, 685.0], [39.6, 687.0], [39.7, 689.0], [39.8, 691.0], [39.9, 692.0], [40.0, 694.0], [40.1, 696.0], [40.2, 698.0], [40.3, 700.0], [40.4, 702.0], [40.5, 704.0], [40.6, 706.0], [40.7, 707.0], [40.8, 709.0], [40.9, 711.0], [41.0, 713.0], [41.1, 715.0], [41.2, 717.0], [41.3, 719.0], [41.4, 720.0], [41.5, 722.0], [41.6, 724.0], [41.7, 726.0], [41.8, 728.0], [41.9, 730.0], [42.0, 732.0], [42.1, 734.0], [42.2, 736.0], [42.3, 738.0], [42.4, 740.0], [42.5, 742.0], [42.6, 744.0], [42.7, 745.0], [42.8, 747.0], [42.9, 749.0], [43.0, 751.0], [43.1, 753.0], [43.2, 754.0], [43.3, 756.0], [43.4, 758.0], [43.5, 760.0], [43.6, 762.0], [43.7, 764.0], [43.8, 766.0], [43.9, 768.0], [44.0, 770.0], [44.1, 772.0], [44.2, 774.0], [44.3, 777.0], [44.4, 779.0], [44.5, 781.0], [44.6, 783.0], [44.7, 784.0], [44.8, 786.0], [44.9, 788.0], [45.0, 790.0], [45.1, 792.0], [45.2, 794.0], [45.3, 796.0], [45.4, 798.0], [45.5, 800.0], [45.6, 801.0], [45.7, 803.0], [45.8, 805.0], [45.9, 807.0], [46.0, 809.0], [46.1, 811.0], [46.2, 813.0], [46.3, 816.0], [46.4, 818.0], [46.5, 820.0], [46.6, 822.0], [46.7, 824.0], [46.8, 825.0], [46.9, 827.0], [47.0, 829.0], [47.1, 831.0], [47.2, 833.0], [47.3, 835.0], [47.4, 837.0], [47.5, 839.0], [47.6, 842.0], [47.7, 844.0], [47.8, 846.0], [47.9, 848.0], [48.0, 851.0], [48.1, 853.0], [48.2, 855.0], [48.3, 857.0], [48.4, 859.0], [48.5, 861.0], [48.6, 864.0], [48.7, 866.0], [48.8, 868.0], [48.9, 870.0], [49.0, 872.0], [49.1, 874.0], [49.2, 876.0], [49.3, 878.0], [49.4, 880.0], [49.5, 882.0], [49.6, 884.0], [49.7, 886.0], [49.8, 888.0], [49.9, 890.0], [50.0, 892.0], [50.1, 894.0], [50.2, 896.0], [50.3, 899.0], [50.4, 901.0], [50.5, 903.0], [50.6, 905.0], [50.7, 907.0], [50.8, 910.0], [50.9, 912.0], [51.0, 914.0], [51.1, 916.0], [51.2, 918.0], [51.3, 920.0], [51.4, 922.0], [51.5, 924.0], [51.6, 926.0], [51.7, 928.0], [51.8, 930.0], [51.9, 932.0], [52.0, 934.0], [52.1, 937.0], [52.2, 938.0], [52.3, 941.0], [52.4, 943.0], [52.5, 945.0], [52.6, 947.0], [52.7, 949.0], [52.8, 952.0], [52.9, 953.0], [53.0, 955.0], [53.1, 958.0], [53.2, 960.0], [53.3, 962.0], [53.4, 964.0], [53.5, 966.0], [53.6, 968.0], [53.7, 970.0], [53.8, 972.0], [53.9, 974.0], [54.0, 976.0], [54.1, 978.0], [54.2, 980.0], [54.3, 982.0], [54.4, 984.0], [54.5, 986.0], [54.6, 988.0], [54.7, 990.0], [54.8, 992.0], [54.9, 994.0], [55.0, 996.0], [55.1, 998.0], [55.2, 1000.0], [55.3, 1002.0], [55.4, 1004.0], [55.5, 1006.0], [55.6, 1008.0], [55.7, 1010.0], [55.8, 1012.0], [55.9, 1015.0], [56.0, 1017.0], [56.1, 1019.0], [56.2, 1021.0], [56.3, 1024.0], [56.4, 1026.0], [56.5, 1028.0], [56.6, 1030.0], [56.7, 1032.0], [56.8, 1035.0], [56.9, 1037.0], [57.0, 1039.0], [57.1, 1042.0], [57.2, 1044.0], [57.3, 1046.0], [57.4, 1048.0], [57.5, 1051.0], [57.6, 1052.0], [57.7, 1055.0], [57.8, 1056.0], [57.9, 1058.0], [58.0, 1060.0], [58.1, 1062.0], [58.2, 1065.0], [58.3, 1067.0], [58.4, 1069.0], [58.5, 1072.0], [58.6, 1074.0], [58.7, 1076.0], [58.8, 1078.0], [58.9, 1080.0], [59.0, 1083.0], [59.1, 1085.0], [59.2, 1087.0], [59.3, 1089.0], [59.4, 1092.0], [59.5, 1094.0], [59.6, 1096.0], [59.7, 1099.0], [59.8, 1101.0], [59.9, 1103.0], [60.0, 1105.0], [60.1, 1107.0], [60.2, 1109.0], [60.3, 1111.0], [60.4, 1114.0], [60.5, 1116.0], [60.6, 1119.0], [60.7, 1121.0], [60.8, 1123.0], [60.9, 1126.0], [61.0, 1128.0], [61.1, 1131.0], [61.2, 1133.0], [61.3, 1134.0], [61.4, 1136.0], [61.5, 1139.0], [61.6, 1141.0], [61.7, 1143.0], [61.8, 1146.0], [61.9, 1148.0], [62.0, 1150.0], [62.1, 1153.0], [62.2, 1155.0], [62.3, 1157.0], [62.4, 1160.0], [62.5, 1162.0], [62.6, 1164.0], [62.7, 1167.0], [62.8, 1168.0], [62.9, 1170.0], [63.0, 1173.0], [63.1, 1176.0], [63.2, 1178.0], [63.3, 1181.0], [63.4, 1184.0], [63.5, 1186.0], [63.6, 1188.0], [63.7, 1190.0], [63.8, 1192.0], [63.9, 1194.0], [64.0, 1197.0], [64.1, 1199.0], [64.2, 1201.0], [64.3, 1203.0], [64.4, 1205.0], [64.5, 1207.0], [64.6, 1210.0], [64.7, 1212.0], [64.8, 1215.0], [64.9, 1217.0], [65.0, 1220.0], [65.1, 1222.0], [65.2, 1224.0], [65.3, 1227.0], [65.4, 1229.0], [65.5, 1232.0], [65.6, 1234.0], [65.7, 1236.0], [65.8, 1239.0], [65.9, 1241.0], [66.0, 1244.0], [66.1, 1246.0], [66.2, 1248.0], [66.3, 1251.0], [66.4, 1253.0], [66.5, 1256.0], [66.6, 1258.0], [66.7, 1261.0], [66.8, 1263.0], [66.9, 1266.0], [67.0, 1269.0], [67.1, 1272.0], [67.2, 1274.0], [67.3, 1277.0], [67.4, 1279.0], [67.5, 1281.0], [67.6, 1284.0], [67.7, 1287.0], [67.8, 1289.0], [67.9, 1292.0], [68.0, 1294.0], [68.1, 1296.0], [68.2, 1299.0], [68.3, 1301.0], [68.4, 1304.0], [68.5, 1306.0], [68.6, 1309.0], [68.7, 1311.0], [68.8, 1314.0], [68.9, 1317.0], [69.0, 1320.0], [69.1, 1322.0], [69.2, 1325.0], [69.3, 1328.0], [69.4, 1330.0], [69.5, 1333.0], [69.6, 1336.0], [69.7, 1339.0], [69.8, 1342.0], [69.9, 1344.0], [70.0, 1347.0], [70.1, 1350.0], [70.2, 1353.0], [70.3, 1356.0], [70.4, 1359.0], [70.5, 1362.0], [70.6, 1365.0], [70.7, 1367.0], [70.8, 1371.0], [70.9, 1373.0], [71.0, 1376.0], [71.1, 1379.0], [71.2, 1382.0], [71.3, 1385.0], [71.4, 1388.0], [71.5, 1391.0], [71.6, 1394.0], [71.7, 1397.0], [71.8, 1399.0], [71.9, 1401.0], [72.0, 1405.0], [72.1, 1407.0], [72.2, 1410.0], [72.3, 1413.0], [72.4, 1417.0], [72.5, 1419.0], [72.6, 1423.0], [72.7, 1425.0], [72.8, 1429.0], [72.9, 1432.0], [73.0, 1434.0], [73.1, 1437.0], [73.2, 1441.0], [73.3, 1444.0], [73.4, 1446.0], [73.5, 1449.0], [73.6, 1452.0], [73.7, 1456.0], [73.8, 1459.0], [73.9, 1463.0], [74.0, 1466.0], [74.1, 1469.0], [74.2, 1472.0], [74.3, 1475.0], [74.4, 1477.0], [74.5, 1481.0], [74.6, 1484.0], [74.7, 1487.0], [74.8, 1490.0], [74.9, 1493.0], [75.0, 1496.0], [75.1, 1499.0], [75.2, 1502.0], [75.3, 1505.0], [75.4, 1509.0], [75.5, 1512.0], [75.6, 1516.0], [75.7, 1518.0], [75.8, 1521.0], [75.9, 1524.0], [76.0, 1527.0], [76.1, 1531.0], [76.2, 1534.0], [76.3, 1537.0], [76.4, 1541.0], [76.5, 1544.0], [76.6, 1548.0], [76.7, 1551.0], [76.8, 1555.0], [76.9, 1559.0], [77.0, 1562.0], [77.1, 1566.0], [77.2, 1569.0], [77.3, 1572.0], [77.4, 1575.0], [77.5, 1579.0], [77.6, 1582.0], [77.7, 1586.0], [77.8, 1589.0], [77.9, 1593.0], [78.0, 1596.0], [78.1, 1600.0], [78.2, 1604.0], [78.3, 1607.0], [78.4, 1611.0], [78.5, 1615.0], [78.6, 1619.0], [78.7, 1623.0], [78.8, 1626.0], [78.9, 1630.0], [79.0, 1635.0], [79.1, 1638.0], [79.2, 1642.0], [79.3, 1646.0], [79.4, 1650.0], [79.5, 1654.0], [79.6, 1659.0], [79.7, 1663.0], [79.8, 1666.0], [79.9, 1670.0], [80.0, 1674.0], [80.1, 1678.0], [80.2, 1682.0], [80.3, 1685.0], [80.4, 1690.0], [80.5, 1694.0], [80.6, 1698.0], [80.7, 1703.0], [80.8, 1707.0], [80.9, 1711.0], [81.0, 1716.0], [81.1, 1720.0], [81.2, 1724.0], [81.3, 1728.0], [81.4, 1733.0], [81.5, 1737.0], [81.6, 1741.0], [81.7, 1745.0], [81.8, 1750.0], [81.9, 1754.0], [82.0, 1759.0], [82.1, 1763.0], [82.2, 1768.0], [82.3, 1771.0], [82.4, 1776.0], [82.5, 1782.0], [82.6, 1786.0], [82.7, 1790.0], [82.8, 1796.0], [82.9, 1800.0], [83.0, 1805.0], [83.1, 1809.0], [83.2, 1815.0], [83.3, 1819.0], [83.4, 1824.0], [83.5, 1829.0], [83.6, 1834.0], [83.7, 1839.0], [83.8, 1845.0], [83.9, 1850.0], [84.0, 1855.0], [84.1, 1861.0], [84.2, 1867.0], [84.3, 1872.0], [84.4, 1879.0], [84.5, 1884.0], [84.6, 1891.0], [84.7, 1897.0], [84.8, 1903.0], [84.9, 1908.0], [85.0, 1913.0], [85.1, 1919.0], [85.2, 1925.0], [85.3, 1931.0], [85.4, 1936.0], [85.5, 1942.0], [85.6, 1948.0], [85.7, 1954.0], [85.8, 1960.0], [85.9, 1966.0], [86.0, 1973.0], [86.1, 1980.0], [86.2, 1987.0], [86.3, 1992.0], [86.4, 1998.0], [86.5, 2005.0], [86.6, 2012.0], [86.7, 2017.0], [86.8, 2023.0], [86.9, 2029.0], [87.0, 2036.0], [87.1, 2042.0], [87.2, 2050.0], [87.3, 2057.0], [87.4, 2063.0], [87.5, 2070.0], [87.6, 2076.0], [87.7, 2083.0], [87.8, 2090.0], [87.9, 2096.0], [88.0, 2103.0], [88.1, 2109.0], [88.2, 2116.0], [88.3, 2122.0], [88.4, 2129.0], [88.5, 2135.0], [88.6, 2143.0], [88.7, 2150.0], [88.8, 2157.0], [88.9, 2163.0], [89.0, 2170.0], [89.1, 2177.0], [89.2, 2184.0], [89.3, 2192.0], [89.4, 2199.0], [89.5, 2206.0], [89.6, 2213.0], [89.7, 2220.0], [89.8, 2226.0], [89.9, 2233.0], [90.0, 2240.0], [90.1, 2247.0], [90.2, 2253.0], [90.3, 2261.0], [90.4, 2267.0], [90.5, 2274.0], [90.6, 2281.0], [90.7, 2287.0], [90.8, 2293.0], [90.9, 2300.0], [91.0, 2305.0], [91.1, 2312.0], [91.2, 2319.0], [91.3, 2327.0], [91.4, 2336.0], [91.5, 2343.0], [91.6, 2352.0], [91.7, 2360.0], [91.8, 2367.0], [91.9, 2375.0], [92.0, 2382.0], [92.1, 2390.0], [92.2, 2397.0], [92.3, 2405.0], [92.4, 2414.0], [92.5, 2422.0], [92.6, 2433.0], [92.7, 2442.0], [92.8, 2450.0], [92.9, 2463.0], [93.0, 2474.0], [93.1, 2483.0], [93.2, 2492.0], [93.3, 2504.0], [93.4, 2515.0], [93.5, 2526.0], [93.6, 2540.0], [93.7, 2553.0], [93.8, 2564.0], [93.9, 2577.0], [94.0, 2589.0], [94.1, 2602.0], [94.2, 2614.0], [94.3, 2628.0], [94.4, 2642.0], [94.5, 2656.0], [94.6, 2673.0], [94.7, 2686.0], [94.8, 2701.0], [94.9, 2714.0], [95.0, 2728.0], [95.1, 2740.0], [95.2, 2753.0], [95.3, 2766.0], [95.4, 2780.0], [95.5, 2798.0], [95.6, 2815.0], [95.7, 2832.0], [95.8, 2851.0], [95.9, 2869.0], [96.0, 2889.0], [96.1, 2907.0], [96.2, 2928.0], [96.3, 2948.0], [96.4, 2969.0], [96.5, 2989.0], [96.6, 3013.0], [96.7, 3032.0], [96.8, 3056.0], [96.9, 3073.0], [97.0, 3094.0], [97.1, 3116.0], [97.2, 3136.0], [97.3, 3163.0], [97.4, 3196.0], [97.5, 3225.0], [97.6, 3253.0], [97.7, 3284.0], [97.8, 3313.0], [97.9, 3347.0], [98.0, 3377.0], [98.1, 3408.0], [98.2, 3440.0], [98.3, 3471.0], [98.4, 3508.0], [98.5, 3553.0], [98.6, 3592.0], [98.7, 3630.0], [98.8, 3676.0], [98.9, 3736.0], [99.0, 3794.0], [99.1, 3859.0], [99.2, 3940.0], [99.3, 4032.0], [99.4, 4140.0], [99.5, 4238.0], [99.6, 4339.0], [99.7, 4466.0], [99.8, 4658.0], [99.9, 4931.0], [100.0, 6692.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 8913.0, "series": [{"data": [[0.0, 5978.0], [600.0, 5696.0], [700.0, 5891.0], [800.0, 5444.0], [900.0, 5451.0], [1000.0, 5155.0], [1100.0, 4948.0], [1200.0, 4595.0], [1300.0, 4054.0], [1400.0, 3719.0], [1500.0, 3334.0], [1600.0, 2866.0], [1700.0, 2543.0], [1800.0, 2101.0], [1900.0, 1880.0], [2000.0, 1725.0], [2100.0, 1646.0], [2200.0, 1671.0], [2300.0, 1492.0], [2400.0, 1181.0], [2500.0, 913.0], [2600.0, 806.0], [2700.0, 802.0], [2800.0, 617.0], [2900.0, 552.0], [3000.0, 544.0], [3100.0, 436.0], [3300.0, 363.0], [3200.0, 379.0], [3400.0, 341.0], [3500.0, 270.0], [3600.0, 245.0], [3700.0, 194.0], [3800.0, 165.0], [3900.0, 132.0], [4000.0, 102.0], [4100.0, 113.0], [4200.0, 105.0], [4300.0, 117.0], [4400.0, 61.0], [4500.0, 71.0], [4600.0, 42.0], [4700.0, 54.0], [4800.0, 35.0], [5000.0, 16.0], [5100.0, 12.0], [4900.0, 26.0], [5200.0, 18.0], [5300.0, 10.0], [5600.0, 6.0], [5400.0, 6.0], [5500.0, 7.0], [5700.0, 5.0], [5800.0, 3.0], [5900.0, 5.0], [6100.0, 1.0], [6200.0, 1.0], [6300.0, 3.0], [6600.0, 1.0], [6400.0, 2.0], [100.0, 8913.0], [200.0, 7616.0], [300.0, 6211.0], [400.0, 5639.0], [500.0, 5298.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 6600.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 27995.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 50224.0, "series": [{"data": [[1.0, 50224.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 34409.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 27995.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 325.0566757118831, "minX": 1.54989198E12, "maxY": 1369.1099958838636, "series": [{"data": [[1.5498921E12, 1369.1099958838636], [1.54989198E12, 325.0566757118831], [1.54989204E12, 985.9257105445641]], "isOverall": false, "label": "bzm - Concurrency Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5498921E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 21.0, "minX": 2.0, "maxY": 5982.0, "series": [{"data": [[2.0, 2171.0], [3.0, 2163.0], [4.0, 2319.0], [5.0, 2075.0], [6.0, 2683.0], [7.0, 1825.0], [9.0, 2527.0], [10.0, 2026.0], [12.0, 2197.5], [13.0, 2920.0], [14.0, 2050.0], [16.0, 2017.0], [17.0, 2100.0], [18.0, 2592.0], [19.0, 2092.0], [20.0, 2365.0], [21.0, 2777.0], [23.0, 2792.5], [24.0, 3024.0], [25.0, 2945.0], [26.0, 2952.0], [28.0, 3018.0], [29.0, 2331.0], [30.0, 2703.0], [33.0, 2618.5], [32.0, 2235.0], [35.0, 2304.0], [34.0, 3059.0], [37.0, 1884.0], [36.0, 3187.0], [38.0, 1888.0], [41.0, 2746.0], [40.0, 2170.5], [43.0, 2336.0], [42.0, 2186.0], [45.0, 1952.0], [44.0, 2656.0], [47.0, 2300.0], [46.0, 2300.0], [49.0, 2255.0], [48.0, 1865.0], [51.0, 1846.0], [50.0, 2211.0], [52.0, 2073.0], [55.0, 2085.0], [54.0, 2010.0], [57.0, 1834.0], [56.0, 2059.0], [58.0, 2171.0], [61.0, 2058.0], [60.0, 1952.5], [63.0, 1866.0], [62.0, 2130.0], [67.0, 2000.0], [66.0, 2026.0], [65.0, 2143.5], [71.0, 2895.0], [70.0, 2060.0], [69.0, 2642.0], [68.0, 2053.0], [75.0, 2527.0], [73.0, 2513.5], [79.0, 2007.0], [78.0, 2748.0], [77.0, 3088.0], [76.0, 1814.0], [83.0, 2098.0], [82.0, 2046.0], [81.0, 1871.0], [80.0, 2307.0], [86.0, 2284.0], [85.0, 2306.0], [84.0, 2003.0], [91.0, 2305.0], [90.0, 2292.0], [89.0, 2146.0], [88.0, 1966.0], [95.0, 2119.0], [94.0, 3058.0], [93.0, 1998.0], [98.0, 2206.0], [96.0, 2020.5], [103.0, 2962.0], [102.0, 2205.0], [101.0, 2052.0], [100.0, 2121.0], [107.0, 2314.0], [106.0, 2125.5], [104.0, 2145.0], [111.0, 2143.0], [110.0, 2235.0], [109.0, 2640.0], [108.0, 1817.0], [114.0, 2798.0], [112.0, 2115.0], [119.0, 2277.0], [118.0, 2129.0], [117.0, 2565.0], [116.0, 2054.0], [123.0, 2185.0], [122.0, 2283.0], [121.0, 1985.0], [120.0, 2101.0], [127.0, 2152.0], [126.0, 2182.0], [125.0, 2132.0], [124.0, 2305.0], [135.0, 2114.0], [134.0, 2080.0], [133.0, 1956.0], [132.0, 2446.0], [130.0, 2170.5], [128.0, 2181.0], [140.0, 188.23012273212416], [141.0, 197.36781609195404], [143.0, 2273.0], [142.0, 2968.0], [139.0, 2695.0], [138.0, 1873.0], [137.0, 1994.5], [151.0, 2307.0], [149.0, 3210.0], [148.0, 2146.0], [147.0, 3074.0], [146.0, 2283.0], [145.0, 2954.0], [144.0, 2173.0], [152.0, 1071.5], [159.0, 3506.0], [158.0, 2629.0], [156.0, 2888.0], [154.0, 3008.0], [153.0, 3779.0], [167.0, 2175.0], [165.0, 2610.0], [164.0, 2166.0], [163.0, 3011.0], [162.0, 2594.0], [161.0, 3691.0], [160.0, 2040.0], [172.0, 1178.5], [173.0, 139.0], [175.0, 2174.0], [174.0, 2434.5], [171.0, 2099.0], [170.0, 2217.0], [169.0, 2087.0], [168.0, 2090.0], [178.0, 1463.0], [180.0, 1072.0], [181.0, 763.75], [183.0, 1818.0], [182.0, 1837.0], [179.0, 2158.0], [176.0, 1819.0], [184.0, 355.0], [186.0, 118.0], [188.0, 894.0], [190.0, 2078.0], [189.0, 2259.0], [187.0, 2128.0], [185.0, 2095.0], [198.0, 567.6], [199.0, 335.47058823529414], [197.0, 2700.0], [196.0, 2029.0], [195.0, 2185.5], [193.0, 2447.0], [202.0, 1691.0], [204.0, 743.0], [207.0, 1208.0], [206.0, 2940.0], [205.0, 2826.0], [203.0, 2080.0], [201.0, 2728.0], [200.0, 3014.0], [208.0, 1367.0], [215.0, 2888.0], [214.0, 2234.0], [213.0, 3401.0], [212.0, 2595.0], [211.0, 2206.0], [210.0, 2563.0], [209.0, 2976.0], [223.0, 2093.0], [222.0, 2250.5], [220.0, 2158.0], [219.0, 2457.0], [217.0, 2188.0], [216.0, 2285.0], [230.0, 1176.5], [231.0, 2153.0], [229.0, 2587.0], [228.0, 2170.0], [227.0, 2153.0], [226.0, 2102.0], [225.0, 2113.0], [224.0, 2251.0], [239.0, 2178.0], [238.0, 2238.0], [237.0, 2111.5], [235.0, 2191.5], [233.0, 2151.0], [232.0, 2121.0], [247.0, 2120.0], [246.0, 2408.5], [245.0, 2153.0], [244.0, 2295.0], [242.0, 2531.5], [249.0, 526.3333333333334], [250.0, 1119.0], [253.0, 694.25], [254.0, 1020.3333333333334], [255.0, 860.25], [252.0, 1939.5], [248.0, 2176.0], [259.0, 394.22222222222223], [256.0, 888.3333333333334], [263.0, 2038.0], [262.0, 2011.0], [261.0, 1855.0], [260.0, 2775.0], [257.0, 415.1428571428571], [258.0, 591.6], [266.0, 208.625], [267.0, 919.6666666666667], [269.0, 573.25], [268.0, 2211.0], [271.0, 2039.0], [265.0, 1760.0], [264.0, 2054.0], [270.0, 2067.0], [286.0, 1301.75], [280.0, 326.3887180700097], [283.0, 103.5], [285.0, 637.0], [287.0, 2007.0], [284.0, 1967.0], [282.0, 1876.0], [281.0, 1770.0], [279.0, 1771.0], [273.0, 2210.0], [272.0, 2165.0], [275.0, 1894.0], [274.0, 1911.0], [278.0, 1759.0], [277.0, 1956.5], [302.0, 2054.0], [289.0, 1060.5], [288.0, 690.6666666666666], [295.0, 1808.0], [291.0, 701.3333333333334], [290.0, 1749.0], [293.0, 762.0], [292.0, 1751.0], [294.0, 612.0], [303.0, 1765.0], [297.0, 1753.5], [299.0, 1764.0], [298.0, 4854.0], [301.0, 4853.0], [300.0, 4852.0], [318.0, 1136.5], [306.0, 2108.0], [307.0, 2065.5], [311.0, 680.5], [304.0, 4021.0], [310.0, 3883.0], [309.0, 1766.0], [308.0, 5982.0], [312.0, 639.3333333333334], [314.0, 1437.75], [313.0, 4848.0], [315.0, 4002.5], [319.0, 2126.0], [317.0, 2034.0], [316.0, 5963.0], [323.0, 568.1666666666667], [320.0, 280.42857142857144], [321.0, 1465.3333333333333], [322.0, 1069.5], [326.0, 647.0], [325.0, 2441.0], [327.0, 2933.0], [329.0, 1346.0], [331.0, 535.0], [330.0, 1941.0], [332.0, 1393.5], [333.0, 563.0], [334.0, 1157.0], [335.0, 1913.0], [328.0, 1723.0], [337.0, 1272.6666666666667], [336.0, 286.5], [338.0, 676.25], [339.0, 2180.0], [350.0, 1696.5], [346.0, 2825.0], [345.0, 1845.0], [344.0, 3129.0], [343.0, 3015.0], [342.0, 1815.5], [340.0, 1696.0], [354.0, 215.5], [353.0, 118.0], [355.0, 1617.0], [363.0, 318.4545454545455], [364.0, 391.0], [365.0, 59.0], [366.0, 30.0], [356.0, 2190.0], [352.0, 2400.0], [371.0, 204.0], [383.0, 412.66666666666663], [384.0, 287.5], [386.0, 338.3333333333333], [389.0, 21.0], [390.0, 329.0], [391.0, 68.0], [398.0, 123.0], [393.0, 1893.9090909090908], [392.0, 2112.3333333333335], [403.0, 2039.0], [405.0, 247.0], [409.0, 1988.0], [414.0, 1730.25], [412.0, 1595.0], [408.0, 1245.0], [406.0, 1251.0], [402.0, 2025.0], [400.0, 1931.0], [423.0, 1106.6666666666667], [416.0, 786.0], [420.0, 475.871225983531], [424.0, 512.0], [425.0, 554.5], [427.0, 568.5], [430.0, 1524.5], [431.0, 1555.763157894737], [426.0, 1688.0], [446.0, 2542.0], [444.0, 800.5], [447.0, 2661.0], [445.0, 1176.0], [443.0, 2023.0], [442.0, 1351.0], [441.0, 2025.0], [440.0, 1932.0], [439.0, 2255.3333333333335], [434.0, 1291.0], [433.0, 1371.0], [438.0, 1432.0], [437.0, 3288.0], [436.0, 2652.0], [463.0, 1303.6666666666667], [448.0, 1782.8333333333335], [449.0, 1453.6666666666665], [451.0, 1535.5], [450.0, 1538.0], [452.0, 1464.8], [453.0, 404.0], [455.0, 2000.0], [454.0, 1904.5], [459.0, 792.9], [461.0, 2432.0], [460.0, 1648.0], [458.0, 1418.0], [457.0, 2081.0], [456.0, 1248.0], [465.0, 848.0], [467.0, 666.5], [468.0, 442.5], [472.0, 443.5], [473.0, 606.5], [476.0, 1125.5], [478.0, 1407.0], [481.0, 1563.5], [487.0, 1188.3333333333333], [494.0, 1708.0], [492.0, 1537.0], [490.0, 1402.0], [489.0, 1271.0], [486.0, 2093.0], [485.0, 1906.0], [483.0, 1362.0], [510.0, 2535.0], [511.0, 1192.0], [509.0, 1284.0], [508.0, 1329.0], [507.0, 1162.0], [506.0, 2023.5], [505.0, 1878.0], [504.0, 1412.0], [502.0, 1672.0], [497.0, 1333.0], [496.0, 1643.142857142857], [499.0, 1414.0], [498.0, 3008.0], [501.0, 2284.0], [500.0, 1448.0], [541.0, 498.25], [532.0, 3013.0], [542.0, 1195.0], [528.0, 1499.0], [530.0, 1663.0], [529.0, 1466.0], [539.0, 1610.5], [538.0, 1490.0], [537.0, 1844.5], [518.0, 2343.5], [516.0, 1275.0], [515.0, 1313.0], [514.0, 1474.0], [513.0, 1885.0], [512.0, 2869.0], [527.0, 1249.0], [526.0, 1878.0], [525.0, 1603.5], [523.0, 1740.0], [521.0, 2281.5], [520.0, 1934.0], [535.0, 2514.0], [534.0, 2049.0], [533.0, 1371.0], [550.0, 1065.75], [555.0, 995.8333333333334], [544.0, 1602.0], [545.0, 979.8], [546.0, 660.0], [549.0, 1684.0], [547.0, 1326.6666666666667], [560.0, 635.6213256484135], [561.0, 1268.0], [564.0, 1277.5], [562.0, 1750.0], [567.0, 1252.5], [565.0, 2343.0], [569.0, 1073.5], [568.0, 2402.0], [570.0, 1134.0], [572.0, 2528.0], [571.0, 2525.0], [574.0, 2509.0], [573.0, 1293.0], [575.0, 1177.0], [552.0, 1315.8], [553.0, 1360.0], [554.0, 493.5], [558.0, 1558.0], [557.0, 1823.0], [602.0, 1236.5], [606.0, 1454.0], [579.0, 1068.0], [582.0, 944.5], [580.0, 2690.0], [600.0, 1190.0], [583.0, 1645.0], [603.0, 1295.0], [584.0, 961.0], [587.0, 1333.0], [585.0, 2395.5], [589.0, 2566.0], [588.0, 1502.0], [590.0, 1212.0], [591.0, 1390.0], [576.0, 2371.0], [578.0, 1063.0], [577.0, 2526.0], [597.0, 762.0], [599.0, 924.0], [598.0, 1979.5], [607.0, 1160.0], [594.0, 1085.0], [592.0, 1017.0], [596.0, 2548.0], [595.0, 2751.0], [605.0, 2465.0], [604.0, 1048.0], [637.0, 1885.5], [617.0, 951.25], [620.0, 1297.6666666666667], [623.0, 1269.0], [610.0, 1394.0], [609.0, 1128.0], [614.0, 1325.0], [613.0, 1223.3333333333333], [621.0, 1209.0], [626.0, 849.5], [625.0, 1354.0], [624.0, 2701.0], [629.0, 1322.0], [628.0, 2032.0], [631.0, 1162.0], [630.0, 1453.0], [639.0, 1269.0], [638.0, 2405.0], [635.0, 2628.0], [634.0, 1048.0], [633.0, 1291.0], [632.0, 1363.0], [665.0, 857.1666666666667], [641.0, 903.0], [640.0, 1262.0], [642.0, 1549.3333333333333], [643.0, 1042.5], [645.0, 1441.0], [644.0, 1339.0], [647.0, 1204.0], [646.0, 1267.0], [652.0, 975.0], [651.0, 1110.0], [650.0, 1112.0], [649.0, 1122.0], [648.0, 1287.0], [653.0, 1073.0], [654.0, 2447.0], [660.0, 699.0], [659.0, 1641.0], [658.0, 1202.0], [661.0, 1679.0], [663.0, 1056.0], [662.0, 1405.0], [670.0, 2462.0], [669.0, 1759.0], [667.0, 1782.0], [698.0, 691.5], [691.0, 1198.0], [693.0, 606.5], [692.0, 934.5], [695.0, 701.3333333333334], [700.0, 775.1314888010517], [701.0, 1611.0], [690.0, 1805.5], [688.0, 995.0], [699.0, 994.0], [697.0, 1893.0], [679.0, 1854.0], [678.0, 1072.0], [677.0, 1265.0], [675.0, 1284.0], [674.0, 955.0], [673.0, 1151.0], [672.0, 1031.5], [687.0, 1132.5], [685.0, 1896.5], [683.0, 978.0], [682.0, 1180.0], [681.0, 985.0], [680.0, 2651.0], [694.0, 1762.0], [729.0, 941.0], [733.0, 977.0], [735.0, 1047.0], [720.0, 1728.5], [722.0, 991.0], [721.0, 979.0], [732.0, 1026.0], [731.0, 2364.0], [730.0, 1638.0], [718.0, 1012.5], [706.0, 963.0], [705.0, 2362.0], [708.0, 1131.0], [707.0, 1062.0], [711.0, 1011.0], [709.0, 1075.6666666666667], [716.0, 988.0], [715.0, 1042.0], [714.0, 1085.0], [713.0, 1054.0], [712.0, 1180.0], [727.0, 2428.5], [725.0, 1003.0], [724.0, 1320.0], [723.0, 2520.0], [760.0, 1732.0], [765.0, 2656.0], [747.0, 769.0], [745.0, 2566.0], [744.0, 981.0], [749.0, 1023.75], [751.0, 2303.0], [737.0, 1712.5], [739.0, 1175.0], [738.0, 1120.0], [741.0, 977.0], [740.0, 1289.0], [743.0, 996.0], [742.0, 937.0], [750.0, 1588.0], [767.0, 2394.0], [752.0, 980.0], [755.0, 1921.0], [753.0, 976.0], [764.0, 952.0], [763.0, 986.5], [761.0, 1696.5], [758.0, 964.0], [757.0, 946.5], [797.0, 1821.0], [787.0, 2238.0], [799.0, 1877.5], [784.0, 1200.0], [795.0, 1802.0], [793.0, 1997.0], [783.0, 955.0], [768.0, 1803.0], [771.0, 1475.0], [770.0, 1210.5], [773.0, 1012.0], [772.0, 2369.0], [775.0, 2314.0], [774.0, 997.0], [782.0, 1031.0], [779.0, 1063.0], [778.0, 978.0], [777.0, 902.0], [776.0, 914.0], [791.0, 2070.0], [789.0, 1549.0], [788.0, 1013.0], [786.0, 1318.0], [785.0, 1267.0], [825.0, 2044.0], [803.0, 1344.3333333333333], [801.0, 1506.0], [800.0, 975.0], [802.0, 961.0], [815.0, 1017.0], [814.0, 1631.0], [804.0, 711.0], [807.0, 1594.0], [805.0, 1168.0], [811.0, 1627.0], [810.0, 968.0], [809.0, 1858.0], [808.0, 961.0], [812.0, 1031.0], [823.0, 853.5], [822.0, 1514.0], [821.0, 2361.0], [820.0, 2041.5], [818.0, 1205.0], [817.0, 1761.0], [816.0, 1302.0], [831.0, 2524.0], [830.0, 1300.0], [829.0, 908.0], [826.0, 2103.0], [827.0, 985.0], [828.0, 1405.3333333333333], [859.0, 888.4999999999999], [835.0, 1432.75], [837.0, 737.3333333333334], [838.0, 2408.0], [840.0, 949.2196732318743], [841.0, 902.6666666666666], [847.0, 1848.0], [832.0, 1338.0], [834.0, 1648.0], [833.0, 879.0], [846.0, 1117.0], [844.0, 1584.0], [843.0, 1039.0], [842.0, 1033.0], [862.0, 932.0], [849.0, 1721.0], [848.0, 905.0], [852.0, 920.0], [850.0, 1827.0], [855.0, 1630.0], [853.0, 920.0], [861.0, 1617.0], [860.0, 899.0], [856.0, 1637.0], [839.0, 2405.0], [893.0, 1747.0], [866.0, 942.0], [876.0, 857.5], [875.0, 1748.0], [874.0, 2912.0], [873.0, 1345.5], [879.0, 1471.5], [865.0, 1624.0], [864.0, 955.0], [877.0, 1689.0], [882.0, 704.75], [881.0, 2373.0], [880.0, 1535.0], [884.0, 1594.0], [887.0, 1576.5], [885.0, 1596.0], [895.0, 551.0], [894.0, 948.0], [892.0, 980.0], [891.0, 1312.0], [889.0, 992.0], [888.0, 1096.0], [871.0, 1595.3333333333333], [869.0, 888.0], [867.0, 909.0], [924.0, 1040.0], [901.0, 1340.5], [900.0, 1811.5], [898.0, 1320.0], [896.0, 1200.0], [910.0, 1332.0], [908.0, 1117.5], [906.0, 2299.0], [905.0, 926.0], [904.0, 1595.0], [902.0, 676.0], [913.0, 253.0], [912.0, 981.0], [915.0, 2046.0], [917.0, 1530.0], [916.0, 1507.0], [927.0, 1407.2], [925.0, 1353.0], [922.0, 912.5], [921.0, 918.0], [903.0, 1509.5], [919.0, 976.0], [918.0, 912.0], [959.0, 901.0], [954.0, 918.6666666666666], [946.0, 878.0], [945.0, 1974.0], [947.0, 1688.0], [953.0, 1229.0], [958.0, 922.0], [956.0, 1046.0], [952.0, 1401.0], [943.0, 1725.5], [929.0, 933.0], [928.0, 951.0], [932.0, 1000.0], [930.0, 929.0], [935.0, 924.0], [934.0, 1674.5], [941.0, 2870.5], [939.0, 914.0], [938.0, 974.0], [936.0, 2865.0], [950.0, 1475.0], [949.0, 2064.5], [986.0, 897.0], [977.0, 1251.0], [980.0, 1132.9023521026409], [978.0, 895.0], [987.0, 1903.0], [989.0, 1733.5], [990.0, 1373.5], [991.0, 1354.0], [976.0, 1672.0], [985.0, 904.0], [967.0, 1703.0], [966.0, 1602.0], [965.0, 916.0], [964.0, 990.0], [963.0, 2188.0], [962.0, 1607.0], [961.0, 924.0], [960.0, 931.0], [975.0, 1632.0], [974.0, 1234.0], [972.0, 1589.0], [971.0, 1591.0], [970.0, 1663.5], [968.0, 912.0], [983.0, 987.0], [982.0, 1023.0], [1018.0, 1370.5], [993.0, 1215.5], [992.0, 895.5], [994.0, 1509.0], [998.0, 1232.25], [995.0, 977.0], [1002.0, 1301.2142857142853], [1000.0, 1276.5], [1005.0, 904.0], [1003.0, 938.0], [1006.0, 917.5], [1022.0, 1234.0], [1023.0, 894.0], [1009.0, 1147.0], [1011.0, 1240.0], [1010.0, 884.0], [1014.0, 1365.75], [1012.0, 1656.0], [1020.0, 1153.0], [1016.0, 1328.5], [1072.0, 946.0], [1082.0, 1133.5], [1052.0, 1532.0], [1046.0, 944.0], [1044.0, 1455.0], [1042.0, 896.0], [1040.0, 911.0], [1038.0, 988.5], [1036.0, 906.0], [1032.0, 931.0], [1030.0, 915.0], [1028.0, 1030.0], [1074.0, 1513.0], [1084.0, 1256.0], [1070.0, 2366.0], [1068.0, 1142.0], [1066.0, 927.5], [1064.0, 1043.0], [1060.0, 966.0], [1058.0, 1006.0], [1056.0, 1441.0], [1080.0, 985.5], [1078.0, 1233.0], [1076.0, 1168.5], [1102.0, 1563.0], [1148.0, 1575.75], [1098.0, 886.5], [1096.0, 1643.5], [1094.0, 922.0], [1100.0, 957.0], [1138.0, 955.0], [1142.0, 906.5], [1140.0, 2043.5], [1150.0, 922.0], [1108.0, 911.0], [1106.0, 1017.0], [1104.0, 1014.0], [1110.0, 1334.0], [1114.0, 3048.0], [1118.0, 964.5], [1088.0, 1270.0], [1090.0, 936.0], [1120.0, 1232.2459941322513], [1122.0, 1326.5], [1124.0, 1773.0], [1158.0, 1789.0], [1212.0, 857.0], [1154.0, 2503.0], [1152.0, 922.0], [1156.0, 1409.0], [1160.0, 1406.0], [1162.0, 883.0], [1164.0, 1011.0], [1166.0, 1170.0], [1182.0, 1366.0], [1180.0, 1380.0], [1178.0, 985.0], [1176.0, 1124.0], [1174.0, 954.5], [1172.0, 1128.6666666666667], [1170.0, 1218.0], [1168.0, 1052.5], [1200.0, 1347.0], [1204.0, 1512.0], [1190.0, 1706.0], [1188.0, 895.0], [1186.0, 883.0], [1184.0, 1038.5], [1192.0, 887.0], [1194.0, 925.0], [1196.0, 1193.0], [1198.0, 1093.5], [1214.0, 1157.0], [1210.0, 1056.0], [1208.0, 912.0], [1228.0, 1025.5], [1272.0, 1083.6666666666667], [1236.0, 1177.0], [1234.0, 2319.0], [1232.0, 1261.0], [1244.0, 902.0], [1218.0, 871.0], [1216.0, 1074.0], [1220.0, 1257.0], [1224.0, 2111.0], [1226.0, 1726.5], [1246.0, 1823.0], [1260.0, 1448.3171689181409], [1258.0, 1100.5], [1256.0, 1116.0], [1254.0, 1156.5], [1252.0, 1137.0], [1250.0, 1392.0], [1274.0, 1456.0], [1270.0, 1063.5], [1268.0, 966.0], [1264.0, 1034.0], [1230.0, 868.0], [1292.0, 862.0], [1336.0, 1246.0], [1280.0, 1237.6], [1310.0, 1105.0], [1308.0, 937.0], [1306.0, 2096.0], [1304.0, 1299.0], [1302.0, 1811.0], [1282.0, 1195.3333333333333], [1288.0, 1250.0], [1290.0, 1121.0], [1294.0, 1059.5], [1328.0, 1552.0], [1330.0, 1923.0], [1332.0, 1594.0], [1334.0, 1523.0], [1296.0, 2315.0], [1300.0, 972.0], [1298.0, 1402.0], [1312.0, 1756.0], [1314.0, 2268.0], [1316.0, 1319.0], [1318.0, 1676.0], [1320.0, 1112.0], [1322.0, 1278.0], [1338.0, 1119.0], [1340.0, 1912.0], [1342.0, 1684.0], [1350.0, 1728.5], [1344.0, 1700.0], [1346.0, 873.0], [1348.0, 1729.0], [1352.0, 763.0], [1356.0, 2833.6666666666665], [1358.0, 1332.5], [1394.0, 1998.0], [1392.0, 3649.0], [1398.0, 2169.6666666666665], [1396.0, 2136.5], [1366.0, 4224.333333333333], [1370.0, 3684.5], [1368.0, 4406.5], [1374.0, 2650.5], [1372.0, 2717.5], [1382.0, 623.0], [1380.0, 4816.0], [1386.0, 2635.0], [1388.0, 5339.0], [1400.0, 1609.3502423077919], [1376.0, 4744.0], [1029.0, 891.0], [1087.0, 924.5], [1055.0, 920.6666666666666], [1053.0, 1606.0], [1051.0, 896.5], [1049.0, 1274.5], [1047.0, 908.0], [1045.0, 1451.0], [1043.0, 883.0], [1035.0, 916.0], [1033.0, 1680.0], [1027.0, 1351.0], [1025.0, 1124.0], [1073.0, 897.0], [1085.0, 1408.6666666666667], [1069.0, 1054.0], [1067.0, 925.0], [1063.0, 970.0], [1061.0, 913.0], [1059.0, 1059.0], [1057.0, 923.0], [1083.0, 909.0], [1081.0, 1386.0], [1097.0, 1210.0], [1093.0, 1040.6666666666667], [1099.0, 887.0], [1103.0, 1520.0], [1137.0, 1718.5], [1147.0, 924.0], [1143.0, 934.0], [1109.0, 2396.0], [1107.0, 991.0], [1105.0, 1056.0], [1117.0, 1501.6666666666667], [1115.0, 1381.0], [1113.0, 1125.6666666666667], [1111.0, 1847.5], [1119.0, 455.0], [1089.0, 894.0], [1091.0, 924.0], [1127.0, 1485.0], [1131.0, 1337.0], [1129.0, 1539.0], [1135.0, 2059.5], [1133.0, 1206.5], [1151.0, 2655.0], [1161.0, 878.0], [1205.0, 910.0], [1191.0, 975.0], [1155.0, 1321.0], [1153.0, 955.0], [1159.0, 1379.0], [1163.0, 1334.0], [1165.0, 1505.0], [1181.0, 933.0], [1179.0, 851.0], [1177.0, 1065.0], [1175.0, 1094.0], [1201.0, 1154.0], [1203.0, 1134.0], [1189.0, 896.0], [1187.0, 1322.0], [1185.0, 998.0], [1193.0, 2218.0], [1195.0, 1182.0], [1199.0, 1206.0], [1213.0, 2169.0], [1211.0, 1271.0], [1243.0, 958.5], [1229.0, 992.5], [1237.0, 1277.0], [1235.0, 848.0], [1233.0, 1149.0], [1239.0, 1112.6666666666667], [1241.0, 1211.5], [1245.0, 852.0], [1247.0, 1191.0], [1221.0, 1180.0], [1223.0, 902.5], [1255.0, 1125.0], [1251.0, 1161.0], [1249.0, 1273.0], [1263.0, 1142.0], [1261.0, 1744.0], [1275.0, 1381.0], [1267.0, 926.0], [1265.0, 1063.0], [1231.0, 1205.0], [1289.0, 2060.0], [1281.0, 1865.0], [1311.0, 1263.0], [1309.0, 1633.0], [1307.0, 1398.0], [1305.0, 1561.5], [1303.0, 914.0], [1287.0, 1645.25], [1285.0, 1017.0], [1283.0, 859.0], [1291.0, 1106.0], [1295.0, 1997.0], [1329.0, 1185.0], [1331.0, 1283.0], [1333.0, 1253.0], [1335.0, 1227.0], [1297.0, 1190.0], [1301.0, 1217.0], [1313.0, 1707.1428571428573], [1315.0, 1614.0], [1317.0, 1853.0], [1319.0, 1035.0], [1321.0, 1194.0], [1323.0, 1216.0], [1327.0, 1795.5], [1325.0, 1525.0], [1337.0, 1772.5], [1339.0, 1654.0], [1341.0, 2109.0], [1343.0, 1863.0], [1347.0, 1014.0], [1399.0, 2929.3333333333335], [1357.0, 2495.5], [1345.0, 1671.0], [1351.0, 1668.0], [1353.0, 1716.0], [1355.0, 1182.75], [1359.0, 3873.5], [1361.0, 2691.6666666666665], [1363.0, 4782.0], [1375.0, 2877.0], [1377.0, 2549.0], [1385.0, 1851.0], [1383.0, 3653.0], [1379.0, 3024.333333333333], [1387.0, 613.0], [1389.0, 598.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[922.5249849060674, 1065.6717867670716]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1400.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 72297.28333333334, "minX": 1.54989198E12, "maxY": 294974.7, "series": [{"data": [[1.5498921E12, 179391.61666666667], [1.54989198E12, 165361.68333333332], [1.54989204E12, 294974.7]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5498921E12, 78431.11666666667], [1.54989198E12, 72297.28333333334], [1.54989204E12, 128964.46666666666]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5498921E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 374.04207742245677, "minX": 1.54989198E12, "maxY": 1622.7323876769233, "series": [{"data": [[1.5498921E12, 1622.7323876769233], [1.54989198E12, 374.04207742245677], [1.54989204E12, 1114.615997843342]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5498921E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 374.0379212035864, "minX": 1.54989198E12, "maxY": 1622.7237437862127, "series": [{"data": [[1.5498921E12, 1622.7237437862127], [1.54989198E12, 374.0379212035864], [1.54989204E12, 1114.6076600169247]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5498921E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 0.1388931679889073, "minX": 1.54989198E12, "maxY": 0.2342716018111007, "series": [{"data": [[1.5498921E12, 0.2342716018111007], [1.54989198E12, 0.15151306976264756], [1.54989204E12, 0.1388931679889073]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5498921E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 9.0, "minX": 1.54989198E12, "maxY": 6692.0, "series": [{"data": [[1.5498921E12, 6692.0], [1.54989198E12, 5684.0], [1.54989204E12, 6343.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5498921E12, 211.0], [1.54989198E12, 9.0], [1.54989204E12, 10.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5498921E12, 2939.0], [1.54989198E12, 886.0], [1.54989204E12, 2473.9000000000015]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5498921E12, 4514.980000000003], [1.54989198E12, 2870.9100000000144], [1.54989204E12, 3792.9900000000016]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5498921E12, 3468.0], [1.54989198E12, 1134.9500000000007], [1.54989204E12, 2856.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5498921E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 345.0, "minX": 485.0, "maxY": 1384.0, "series": [{"data": [[526.0, 1384.0], [865.0, 1232.0], [485.0, 345.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 865.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 345.0, "minX": 485.0, "maxY": 1384.0, "series": [{"data": [[526.0, 1384.0], [865.0, 1232.0], [485.0, 345.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 865.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 494.55, "minX": 1.54989198E12, "maxY": 879.5333333333333, "series": [{"data": [[1.5498921E12, 503.05], [1.54989198E12, 494.55], [1.54989204E12, 879.5333333333333]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5498921E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 485.21666666666664, "minX": 1.54989198E12, "maxY": 865.5333333333333, "series": [{"data": [[1.5498921E12, 526.3833333333333], [1.54989198E12, 485.21666666666664], [1.54989204E12, 865.5333333333333]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5498921E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 485.21666666666664, "minX": 1.54989198E12, "maxY": 865.5333333333333, "series": [{"data": [[1.5498921E12, 526.3833333333333], [1.54989198E12, 485.21666666666664], [1.54989204E12, 865.5333333333333]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5498921E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
